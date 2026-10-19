import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { finalizeCardCheckout, stripeClient } from "@/lib/card-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → us. Configure in the Stripe dashboard (Developers → Webhooks) with the URL
 * https://<domain>/api/stripe/webhook and these events:
 *   payment_intent.amount_capturable_updated, payment_intent.succeeded, payment_intent.canceled
 * and put the signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return Response.json({ error: "Webhook not configured." }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  let event;
  try {
    // The raw body is required: signatures are computed over the exact bytes Stripe sent.
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.amount_capturable_updated":
      case "payment_intent.succeeded": {
        const result = await finalizeCardCheckout(event.data.object.id);
        // A retryable state (another worker is finalising) asks Stripe to deliver again later.
        if (!result.ok && result.retry) return Response.json({ received: true, retry: true }, { status: 409 });
        break;
      }
      case "payment_intent.canceled": {
        await db
          .update(checkoutSessions)
          .set({ status: "failed", failureReason: "Payment cancelled.", updatedAt: new Date() })
          .where(eq(checkoutSessions.paymentIntentId, event.data.object.id));
        break;
      }
      default:
        break;
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", event.type, error);
    // 500 makes Stripe retry with backoff.
    return Response.json({ error: "Handler failed." }, { status: 500 });
  }
}
