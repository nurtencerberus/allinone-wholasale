import Stripe from "stripe";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkoutSessions, orders, users, type CheckoutPayload } from "@/db/schema";
import { canSeePrices, toSessionUser } from "@/lib/auth";
import { priceCart } from "@/lib/checkout";
import {
  cancelOrderAndRestock,
  CouponUnavailableError,
  createOrderRecord,
  DuplicatePaymentError,
  sendOrderConfirmation,
  StockShortError,
} from "@/lib/orders";

/**
 * Card payments are authorised first (capture_method: "manual") and captured only after the
 * order and its stock reservation are committed. Any failure in between cancels the
 * authorisation, so the buyer is never charged for an order that does not exist.
 *
 * The order is created by finalizeCardCheckout(), called by the browser after confirmation,
 * by the Stripe webhook, and by the maintenance cron — whichever comes first. A row lock on
 * checkout_sessions makes it run once.
 */

let client: Stripe | null = null;
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  // STRIPE_API_BASE points the SDK at a local fake for automated tests only; leave it unset.
  const base = process.env.STRIPE_API_BASE?.trim();
  if (!client) {
    if (base) {
      const url = new URL(base);
      client = new Stripe(key, {
        host: url.hostname,
        port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        protocol: url.protocol.replace(":", "") as "http" | "https",
      });
    } else {
      client = new Stripe(key);
    }
  }
  return client;
}

/** A session stuck in "finalizing" this long is assumed to have crashed and may be retried. */
const STALE_FINALIZING_MS = 2 * 60 * 1000;

export type FinalizeResult =
  | { ok: true; orderId: number; orderNumber: string; accessToken: string; alreadyExisted: boolean }
  | { ok: false; status: number; error: string; retry?: boolean };

export async function finalizeCardCheckout(paymentIntentId: string): Promise<FinalizeResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, status: 503, error: "Card payments are not configured." };

  const existing = await orderForIntent(paymentIntentId);
  if (existing) return { ok: true, ...existing, alreadyExisted: true };

  // Claim the session. Only one caller moves it to "finalizing".
  const [session] = await db
    .update(checkoutSessions)
    .set({ status: "finalizing", updatedAt: new Date() })
    .where(
      and(
        eq(checkoutSessions.paymentIntentId, paymentIntentId),
        or(
          eq(checkoutSessions.status, "open"),
          and(
            eq(checkoutSessions.status, "finalizing"),
            lt(checkoutSessions.updatedAt, new Date(Date.now() - STALE_FINALIZING_MS)),
          ),
        ),
      ),
    )
    .returning();

  if (!session) {
    const [row] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.paymentIntentId, paymentIntentId))
      .limit(1);
    if (!row) return { ok: false, status: 404, error: "Unknown payment." };
    if (row.status === "failed") return { ok: false, status: 409, error: row.failureReason ?? "This payment was not completed." };
    const created = await orderForIntent(paymentIntentId);
    if (created) return { ok: true, ...created, alreadyExisted: true };
    return { ok: false, status: 202, error: "Your order is being finalised.", retry: true };
  }

  const fail = async (status: number, error: string, cancelIntent: boolean): Promise<FinalizeResult> => {
    if (cancelIntent) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId, undefined, { idempotencyKey: `cancel:${paymentIntentId}` });
      } catch (cancelError) {
        console.error("[card-checkout] cancel failed", paymentIntentId, cancelError);
      }
    }
    await db
      .update(checkoutSessions)
      .set({ status: "failed", failureReason: error, updatedAt: new Date() })
      .where(eq(checkoutSessions.id, session.id));
    return { ok: false, status, error };
  };

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "requires_payment_method" || intent.status === "requires_confirmation" || intent.status === "requires_action") {
    // Not authorised yet; hand the session back so a later confirmation can finish it.
    await db.update(checkoutSessions).set({ status: "open", updatedAt: new Date() }).where(eq(checkoutSessions.id, session.id));
    return { ok: false, status: 402, error: "Payment is not authorised yet." };
  }
  if (intent.status === "canceled") return fail(409, "This payment was cancelled. No charge was made.", false);
  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    await db.update(checkoutSessions).set({ status: "open", updatedAt: new Date() }).where(eq(checkoutSessions.id, session.id));
    return { ok: false, status: 402, error: `Payment status: ${intent.status}.`, retry: true };
  }
  const releasable = intent.status === "requires_capture";

  const [account] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = account ? toSessionUser(account) : null;
  if (!canSeePrices(user) || !user.emailVerified) {
    return fail(403, "This account can no longer place wholesale orders. No charge was made.", releasable);
  }

  const payload = session.payload as CheckoutPayload;
  const priced = await priceCart({
    items: payload.items,
    user,
    couponCode: payload.couponCode,
    address: payload.address,
    shippingOptionId: payload.shippingOptionId,
  });
  if ("error" in priced) return fail(409, `${priced.error} No charge was made.`, releasable);
  if (priced.blockers.length || priced.removedProductIds.length) {
    return fail(409, `${priced.blockers.join(" ") || "Some items are no longer available."} No charge was made.`, releasable);
  }
  if (priced.total !== intent.amount) {
    return fail(409, "Prices, freight or tax changed while you were paying. No charge was made — please review your order and pay again.", releasable);
  }

  let order;
  try {
    order = await createOrderRecord({
      priced,
      userId: user.id,
      contact: payload.contact,
      address: payload.address,
      paymentMethod: "card",
      paymentStatus: releasable ? "authorized" : "paid",
      paymentRef: paymentIntentId,
      poNumber: null,
      idempotencyKey: null,
      exemptionCert: priced.taxQuote.source === "exempt" ? user.taxExemptCertNumber : null,
    });
  } catch (error) {
    if (error instanceof DuplicatePaymentError) {
      const created = await orderForIntent(paymentIntentId);
      if (created) return { ok: true, ...created, alreadyExisted: true };
    }
    if (error instanceof StockShortError) {
      return fail(409, `${error.productName} sold out while you were paying. No charge was made.`, releasable);
    }
    if (error instanceof CouponUnavailableError) {
      return fail(409, `${error.message} No charge was made — please check out again.`, releasable);
    }
    console.error("[card-checkout] order insert failed", paymentIntentId, error);
    return fail(500, "We could not record your order. No charge was made — please try again.", releasable);
  }

  if (releasable) {
    try {
      await stripe.paymentIntents.capture(paymentIntentId, undefined, { idempotencyKey: `capture:${paymentIntentId}` });
    } catch (error) {
      console.error("[card-checkout] capture failed", paymentIntentId, error);
      await cancelOrderAndRestock(order.id, "card capture failed");
      await db.update(orders).set({ paymentStatus: "capture_failed" }).where(eq(orders.id, order.id));
      return fail(402, "Your card could not be charged. The order was not placed.", true);
    }
    await db.update(orders).set({ paymentStatus: "paid", updatedAt: new Date() }).where(eq(orders.id, order.id));
  }

  await db
    .update(checkoutSessions)
    .set({ status: "ordered", orderId: order.id, updatedAt: new Date() })
    .where(eq(checkoutSessions.id, session.id));
  await sendOrderConfirmation(order, payload.contact, priced.total);

  return { ok: true, orderId: order.id, orderNumber: order.orderNumber, accessToken: order.accessToken, alreadyExisted: false };
}

async function orderForIntent(paymentIntentId: string) {
  const [row] = await db
    .select({ orderId: orders.id, orderNumber: orders.orderNumber, accessToken: orders.accessToken })
    .from(orders)
    .where(eq(orders.paymentRef, paymentIntentId))
    .limit(1);
  return row ? { orderId: row.orderId, orderNumber: row.orderNumber, accessToken: row.accessToken ?? "" } : null;
}

/** Sessions the browser and webhook both missed (e.g. webhook not configured yet). */
export async function sweepStaleCheckouts(): Promise<{ finalized: number; failed: number }> {
  const stale = await db
    .select({ paymentIntentId: checkoutSessions.paymentIntentId })
    .from(checkoutSessions)
    .where(
      and(
        inArray(checkoutSessions.status, ["open", "finalizing"]),
        lt(checkoutSessions.updatedAt, new Date(Date.now() - 10 * 60 * 1000)),
        sql`${checkoutSessions.createdAt} > now() - interval '7 days'`,
      ),
    )
    .limit(50);
  let finalized = 0;
  let failed = 0;
  for (const row of stale) {
    const result = await finalizeCardCheckout(row.paymentIntentId);
    if (result.ok) finalized += 1;
    else if (!result.retry && result.status !== 402) failed += 1;
  }
  return { finalized, failed };
}
