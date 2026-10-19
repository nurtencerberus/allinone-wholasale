import { createHash } from "node:crypto";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { stripeClient } from "@/lib/card-checkout";
import { priceCart } from "@/lib/checkout";
import { parseCheckoutRequest, type CheckoutRequestBody } from "@/lib/checkout-request";
import { demoModeEnabled } from "@/lib/demo-mode";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const limit = await consumeRateLimit("payment-intent", clientIp(request), 60, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as CheckoutRequestBody;

    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });
    if (!user.emailVerified) {
      return Response.json({ error: "Confirm your email address before placing an order." }, { status: 403 });
    }
    const parsed = parseCheckoutRequest(body, user);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const { payload, checkoutId } = parsed;

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
    if (priced.total < 50) {
      return Response.json({ error: "Order total is below the card minimum." }, { status: 400 });
    }

    const stripe = stripeClient();
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
    if (!stripe || !publishableKey) {
      return Response.json({
        mode: demoModeEnabled() ? "demo" : "unavailable",
        clientSecret: null,
        publishableKey: null,
        amount: priced.total,
        quote: priced,
        message: demoModeEnabled()
          ? "Stripe keys are not configured in this environment. The payment step runs in demo mode: no card data is collected or transmitted."
          : "Card payments are not enabled on this store yet.",
      });
    }

    // Same checkout + same priced order → the same PaymentIntent, however often the step reloads.
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ user: user.id, checkoutId, payload, total: priced.total }))
      .digest("hex")
      .slice(0, 40);
    const intent = await stripe.paymentIntents.create(
      {
        amount: priced.total,
        currency: "usd",
        // Authorise now, capture after the order and stock reservation are committed.
        capture_method: "manual",
        allowed_payment_method_types: ["card"],
        description: `Ciputra Corp. — ${priced.cases} case(s), ${priced.unitCount} units`,
        receipt_email: payload.contact.email,
        metadata: {
          user_id: String(user.id),
          checkout_id: checkoutId,
          destination_zip: payload.address.zip,
          tax_exempt: priced.taxQuote.source === "exempt" ? "true" : "false",
        },
      },
      { idempotencyKey: `pi:${fingerprint}` },
    );

    await db
      .insert(checkoutSessions)
      .values({ paymentIntentId: intent.id, userId: user.id, payload, amount: priced.total })
      .onConflictDoNothing({ target: checkoutSessions.paymentIntentId });

    return Response.json({
      mode: "stripe",
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      publishableKey,
      amount: priced.total,
      quote: priced,
    });
  } catch (error) {
    console.error("[payment-intent]", error);
    return Response.json({ error: "Could not initialise the payment." }, { status: 500 });
  }
}
