import Stripe from "stripe";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/password";
import { ORDER_COOKIE_PREFIX } from "@/lib/order-access";
import { demoModeEnabled } from "@/lib/demo-mode";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { priceCart, type CartItemInput, type CheckoutAddress } from "@/lib/checkout";
import { ensureSeeded } from "@/lib/seed";
import { orderConfirmationTemplate, sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as {
      items?: CartItemInput[];
      couponCode?: string;
      address?: CheckoutAddress | null;
      shippingOptionId?: string | null;
      email?: string;
      name?: string;
      company?: string;
      phone?: string;
      notes?: string;
      paymentRef?: string | null;
      paymentMethod?: string;
      poNumber?: string;
    };

    const user = await getSessionUser();
    const email = (body.email ?? user?.email ?? "").trim().toLowerCase();
    const name = (body.name ?? user?.name ?? "").trim();
    const address = body.address;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (name.length < 2) {
      return Response.json({ error: "A contact name is required." }, { status: 400 });
    }
    if (!address?.line1 || !address?.city || !address?.state || !address?.zip) {
      return Response.json({ error: "A complete delivery address is required." }, { status: 400 });
    }
    if (!/^\d{5}$/.test(address.zip)) {
      return Response.json({ error: "Delivery ZIP must be 5 digits." }, { status: 400 });
    }
    if (!body.shippingOptionId) {
      return Response.json({ error: "Select a freight option." }, { status: 400 });
    }
    if (user && !user.emailVerified) {
      return Response.json(
        {
          error:
            "Confirm your email address before placing an order. Double opt-in protects your order updates and tracking. Resend the link from your account page.",
        },
        { status: 403 },
      );
    }

    const priced = await priceCart({
      items: body.items ?? [],
      user,
      couponCode: body.couponCode ?? null,
      address,
      shippingOptionId: body.shippingOptionId,
    });
    if ("error" in priced) return Response.json({ error: priced.error }, { status: 400 });
    if (!priced.shippingOptionId) {
      return Response.json({ error: "The selected freight service is unavailable." }, { status: 400 });
    }

    // Payment verification ------------------------------------------------
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const method: "card" | "net30" | "ach" =
      body.paymentMethod === "net30" || body.paymentMethod === "ach" ? body.paymentMethod : "card";
    let paymentStatus = "paid";
    let paymentRef = body.paymentRef ?? null;
    let poNumber: string | null = null;

    if (method === "net30") {
      // Invoice terms are a trade privilege — enforced here, never by the browser.
      if (!user || user.accountTier !== "wholesale") {
        return Response.json(
          { error: "Net-30 terms are available to approved trade accounts. Sign in or apply for wholesale." },
          { status: 403 },
        );
      }
      const po = (body.poNumber ?? "").trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9 \-_/.#]{2,39}$/.test(po)) {
        return Response.json({ error: "A purchase order number (3–40 characters) is required for Net-30." }, { status: 400 });
      }
      poNumber = po;
      paymentStatus = "net30_invoice";
      paymentRef = null;
    } else if (method === "ach") {
      paymentStatus = "awaiting_payment";
      paymentRef = null;
    } else if (secretKey && paymentRef?.startsWith("pi_")) {
      const stripe = new Stripe(secretKey);
      const intent = await stripe.paymentIntents.retrieve(paymentRef);
      if (intent.status !== "succeeded") {
        return Response.json(
          { error: `Payment is not complete (status: ${intent.status}).` },
          { status: 402 },
        );
      }
      if (intent.amount !== priced.total) {
        return Response.json(
          { error: "Payment amount does not match the cart total. Please retry checkout." },
          { status: 409 },
        );
      }
      paymentStatus = "paid";
    } else if (secretKey) {
      return Response.json({ error: "A completed Stripe payment is required." }, { status: 402 });
    } else {
      if (!demoModeEnabled()) {
        // A live store with no Stripe keys must not "accept" a card it never charged.
        return Response.json(
          {
            error:
              "Card payments are not enabled on this store yet. Choose ACH / wire transfer, or Net-30 if your account is approved.",
          },
          { status: 503 },
        );
      }
      // Demo deployment: simulated payment. Never trust a client-supplied reference.
      paymentStatus = "paid_demo";
      paymentRef = `demo_${Date.now()}`;
    }

    const orderNumber = `MSC-${Date.now().toString().slice(-6)}`;
    const accessToken = randomToken(16);

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: user?.id ?? null,
        email,
        customerName: name,
        company: (body.company ?? user?.company ?? "").trim() || null,
        phone: (body.phone ?? "").trim() || null,
        status: "processing",
        shippingAddress: {
          line1: address.line1,
          line2: address.line2 ?? "",
          city: address.city,
          state: address.state,
          zip: address.zip,
          country: address.country ?? "United States",
        },
        shippingService: priced.shippingService ?? "UPS Ground",
        shippingCarrier: priced.shippingCarrier ?? "UPS",
        subtotal: priced.subtotal,
        accountDiscount: priced.accountDiscount,
        couponCode: priced.couponCode,
        couponDiscount: priced.couponDiscount,
        shippingCost: priced.shippingCost,
        taxRate: priced.taxQuote.rateX1000,
        taxAmount: priced.taxAmount,
        taxExempt: priced.taxQuote.source === "exempt",
        total: priced.total,
        isWholesale: priced.isWholesale,
        paymentStatus,
        paymentMethod: method,
        poNumber,
        accessToken,
        paymentRef,
        notes: (body.notes ?? "").trim() || null,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    if (!order) return Response.json({ error: "Could not create the order." }, { status: 500 });

    await db.insert(orderItems).values(
      priced.lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        name: line.name,
        sku: line.sku,
        image: line.image,
        cases: line.cases,
        unitsPerCase: line.caseSize,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    );

    // Decrement case stock so the portal reflects committed inventory.
    for (const line of priced.lines) {
      await db
        .update(products)
        .set({ stock: sql`greatest(0, ${products.stock} - ${line.cases})` })
        .where(eq(products.id, line.productId));
    }

    const origin = new URL(request.url).origin;
    const template = orderConfirmationTemplate({
      orderNumber: order.orderNumber,
      name,
      total: formatMoney(priced.total),
      url: `${origin}/order/${order.orderNumber}?t=${accessToken}`,
    });
    await sendEmail({ to: email, subject: template.subject, html: template.html, replyTo: SITE.email });

    // Lets the buyer (even as a guest) reopen this confirmation in this browser.
    const jar = await cookies();
    jar.set(`${ORDER_COOKIE_PREFIX}${order.orderNumber}`, accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return Response.json({
      ok: true,
      orderNumber: order.orderNumber,
      accessToken,
      paymentMethod: method,
      total: priced.total,
      paymentStatus,
      freight: {
        carrier: priced.shippingCarrier,
        service: priced.shippingService,
        cost: priced.shippingCost,
        billableLbs: priced.freight.billableLbs,
      },
      tax: { rateX1000: priced.taxQuote.rateX1000, amount: priced.taxAmount, source: priced.taxQuote.source },
    });
  } catch (error) {
    console.error("[orders]", error);
    return Response.json({ error: "Order submission failed. No payment was captured." }, { status: 500 });
  }
}
