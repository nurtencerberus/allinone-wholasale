import Stripe from "stripe";
import { getSessionUser } from "@/lib/auth";
import { priceCart, type CartItemInput, type CheckoutAddress } from "@/lib/checkout";
import { demoModeEnabled } from "@/lib/demo-mode";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const limit = await consumeRateLimit("payment-intent", clientIp(request), 60, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as {
      items?: CartItemInput[];
      couponCode?: string;
      address?: CheckoutAddress | null;
      shippingOptionId?: string | null;
      email?: string;
    };

    const user = await getSessionUser();
    const priced = await priceCart({
      items: body.items ?? [],
      user,
      couponCode: body.couponCode ?? null,
      address: body.address ?? null,
      shippingOptionId: body.shippingOptionId ?? null,
    });

    if ("error" in priced) return Response.json({ error: priced.error }, { status: 400 });
    if (!body.address?.zip || !body.address?.state) {
      return Response.json({ error: "A delivery address is required before payment." }, { status: 400 });
    }
    if (priced.total < 50) {
      return Response.json({ error: "Order total is below the card minimum." }, { status: 400 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

    if (!secretKey || !publishableKey) {
      if (!demoModeEnabled()) {
        return Response.json({
          mode: "unavailable",
          clientSecret: null,
          publishableKey: null,
          amount: priced.total,
          quote: priced,
          message: "Card payments are not enabled on this store yet.",
        });
      }
      return Response.json({
        mode: "demo",
        clientSecret: null,
        publishableKey: null,
        amount: priced.total,
        quote: priced,
        message:
          "Stripe keys are not configured in this environment. The payment step runs in PCI-safe demo mode: no card data is collected or transmitted.",
      });
    }

    const stripe = new Stripe(secretKey);
    const intent = await stripe.paymentIntents.create({
      amount: priced.total,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description: `Ciputra Corp. — ${priced.cases} case(s), ${priced.unitCount} units`,
      receipt_email: body.email || user?.email || undefined,
      metadata: {
        account: user?.email ?? body.email ?? "guest",
        wholesale: priced.isWholesale ? "true" : "false",
        tax_exempt: priced.taxQuote.source === "exempt" ? "true" : "false",
        destination_zip: body.address.zip,
      },
    });

    return Response.json({
      mode: "stripe",
      clientSecret: intent.client_secret,
      publishableKey,
      amount: priced.total,
      quote: priced,
    });
  } catch (error) {
    console.error("[payment-intent]", error);
    return Response.json({ error: "Could not initialise the payment." }, { status: 500 });
  }
}
