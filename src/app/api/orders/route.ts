import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutSessions, orders } from "@/db/schema";
import { revalidateCatalog } from "@/lib/catalog-cache";
import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { finalizeCardCheckout, stripeClient } from "@/lib/card-checkout";
import { priceCart } from "@/lib/checkout";
import { parseCheckoutRequest, type CheckoutRequestBody } from "@/lib/checkout-request";
import { demoModeEnabled } from "@/lib/demo-mode";
import { ORDER_COOKIE_PREFIX } from "@/lib/order-access";
import { alertOps, describeError } from "@/lib/alerts";
import { clearCart } from "@/lib/cart-store";
import { checkCredit, dueDateFor } from "@/lib/credit";
import { CouponUnavailableError, createOrderRecord, sendOrderConfirmation, StockShortError } from "@/lib/orders";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderBody = CheckoutRequestBody & {
  paymentMethod?: string;
  paymentIntentId?: string | null;
  poNumber?: string;
};

/** Lets the buyer reopen this confirmation in this browser without the e-mailed link. */
async function rememberOrder(orderNumber: string, accessToken: string) {
  const jar = await cookies();
  jar.set(`${ORDER_COOKIE_PREFIX}${orderNumber}`, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();

    const limit = await consumeRateLimit("order", clientIp(request), 30, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await request.json()) as OrderBody;
    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });
    if (!user.emailVerified) {
      return Response.json(
        { error: "Confirm your email address before placing an order. Resend the link from your account page." },
        { status: 403 },
      );
    }

    const method: "card" | "net30" | "ach" =
      body.paymentMethod === "net30" || body.paymentMethod === "ach" ? body.paymentMethod : "card";

    // Card with Stripe: the order is built from the server-side checkout session saved
    // when the payment started — the browser only says which payment it confirmed.
    if (method === "card" && stripeClient()) {
      const paymentIntentId = String(body.paymentIntentId ?? "");
      if (!paymentIntentId.startsWith("pi_")) {
        return Response.json({ error: "A confirmed card payment is required." }, { status: 402 });
      }
      const [session] = await db
        .select({ userId: checkoutSessions.userId })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.paymentIntentId, paymentIntentId))
        .limit(1);
      if (!session || session.userId !== user.id) {
        return Response.json({ error: "Unknown payment." }, { status: 404 });
      }
      const result = await finalizeCardCheckout(paymentIntentId);
      if (!result.ok) {
        return Response.json({ error: result.error, retry: Boolean(result.retry) }, { status: result.status });
      }
      await rememberOrder(result.orderNumber, result.accessToken);
      return Response.json({ ok: true, orderNumber: result.orderNumber, accessToken: result.accessToken, paymentMethod: method });
    }

    const parsed = parseCheckoutRequest(body, user);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const { payload, checkoutId } = parsed;
    const idempotencyKey = `${user.id}:${checkoutId}`;

    // A retried submit (timeout, double click) returns the order already placed.
    const [previous] = await db
      .select({ orderNumber: orders.orderNumber, accessToken: orders.accessToken })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);
    if (previous) {
      return Response.json({ ok: true, orderNumber: previous.orderNumber, accessToken: previous.accessToken, paymentMethod: method, repeated: true });
    }

    let paymentStatus: string;
    let paymentRef: string | null = null;
    let poNumber: string | null = null;
    if (method === "net30") {
      // Invoice terms are a trade privilege — enforced here, never by the browser.
      if (user.accountTier !== "wholesale") {
        return Response.json({ error: "Net-30 terms are available to approved trade accounts." }, { status: 403 });
      }
      const po = String(body.poNumber ?? "").trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9 \-_/.#]{2,39}$/.test(po)) {
        return Response.json({ error: "A purchase order number (3–40 characters) is required for Net-30." }, { status: 400 });
      }
      poNumber = po;
      paymentStatus = "net30_invoice";
    } else if (method === "ach") {
      paymentStatus = "awaiting_payment";
    } else if (demoModeEnabled()) {
      // Demo deployment without Stripe keys: simulated card payment. Never trust a client reference.
      paymentStatus = "paid_demo";
      paymentRef = `demo_${checkoutId}`;
    } else {
      return Response.json(
        { error: "Card payments are not enabled on this store yet. Choose ACH / wire transfer, or Net-30 if your account is approved." },
        { status: 503 },
      );
    }

    const priced = await priceCart({
      items: payload.items,
      user,
      couponCode: payload.couponCode,
      address: payload.address,
      shippingOptionId: payload.shippingOptionId,
    });
    if ("error" in priced) return Response.json({ error: priced.error }, { status: 400 });
    if (priced.blockers.length) return Response.json({ error: priced.blockers.join(" ") }, { status: 400 });
    if (priced.removedProductIds.length) {
      return Response.json({ error: "Some items are no longer available. Review your cart and try again." }, { status: 409 });
    }

    // ODE-6: terms are credit. Refuse the order if the account is on hold, has something past
    // due, or this order would take it over its limit — before any stock is reserved.
    let dueAt: Date | null = null;
    if (method === "net30") {
      const decision = await checkCredit(user, priced.total);
      if (!decision.ok) return Response.json({ error: decision.reason }, { status: 402 });
      dueAt = dueDateFor(decision.position.paymentTermsDays);
    }

    let order;
    try {
      order = await createOrderRecord({
        priced,
        userId: user.id,
        companyId: user.companyId,
        contact: payload.contact,
        address: payload.address,
        paymentMethod: method,
        paymentStatus,
        paymentRef,
        poNumber,
        dueAt,
        idempotencyKey,
        exemptionCert: priced.taxQuote.source === "exempt" ? user.taxExemptCertNumber : null,
      });
    } catch (error) {
      if (error instanceof StockShortError) {
        return Response.json({ error: `${error.productName} no longer has enough stock. Please update your cart.` }, { status: 409 });
      }
      if (error instanceof CouponUnavailableError) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      // Lost a race with an identical concurrent submit: return the order it created.
      const [raced] = await db
        .select({ orderNumber: orders.orderNumber, accessToken: orders.accessToken })
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);
      if (raced) {
        return Response.json({ ok: true, orderNumber: raced.orderNumber, accessToken: raced.accessToken, paymentMethod: method, repeated: true });
      }
      throw error;
    }

    // Stock moved, so the catalogue rows in the data cache are out of date.
    revalidateCatalog();
    // The cart became an order: the stored copy must not follow the buyer to the next device.
    await clearCart(user.id).catch((error) => console.error("[orders] cart clear", error));
    await sendOrderConfirmation(order, payload.contact, priced.total);
    await rememberOrder(order.orderNumber, order.accessToken);

    return Response.json({
      ok: true,
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      paymentMethod: method,
      total: priced.total,
      paymentStatus,
    });
  } catch (error) {
    await alertOps({
      key: "order-endpoint-failed",
      subject: "An order could not be placed",
      message: "The order endpoint failed unexpectedly. No card was charged, but the buyer saw an error.",
      context: { error: describeError(error) },
    });
    return Response.json({ error: "Order submission failed. Nothing was charged; please try again." }, { status: 500 });
  }
}
