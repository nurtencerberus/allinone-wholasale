import Stripe from "stripe";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { randomToken } from "@/lib/password";
import { ORDER_COOKIE_PREFIX } from "@/lib/order-access";
import { demoModeEnabled } from "@/lib/demo-mode";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { priceCart, type CartItemInput, type CheckoutAddress } from "@/lib/checkout";
import { ensureSeeded } from "@/lib/seed";
import { orderConfirmationTemplate, sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;

/** Thrown inside the order transaction when a line can no longer be reserved. */
class StockShortError extends Error {
  constructor(public readonly productName: string) {
    super(`${productName} no longer has enough stock.`);
  }
}

function pgConstraint(error: unknown): string | undefined {
  const candidate = error as { constraint?: string; cause?: { constraint?: string } };
  return candidate.constraint ?? candidate.cause?.constraint;
}

/** Unguessable-enough, non-sequential order number. Collisions are retried. */
function newOrderNumber(): string {
  return `MSC-${randomInt(1_000_000, 10_000_000)}`;
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();

    const limit = await consumeRateLimit("order", clientIp(request), 20, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

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
    if (priced.blockers.length) return Response.json({ error: priced.blockers.join(" ") }, { status: 400 });
    if (priced.removedProductIds.length) {
      return Response.json({ error: "Some items are no longer available. Review your cart and try again." }, { status: 409 });
    }
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

    const accessToken = randomToken(16);
    const shippingAddress = {
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country ?? "United States",
    };

    // One captured payment must never become two orders.
    if (paymentRef) {
      const [previous] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.paymentRef, paymentRef))
        .limit(1);
      if (previous) {
        return Response.json({ error: "This payment has already been used for an order." }, { status: 409 });
      }
    }

    // Stock is reserved and the order written in one transaction: either both happen or neither.
    let order: { id: number; orderNumber: string } | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !order; attempt += 1) {
      const orderNumber = newOrderNumber();
      try {
        order = await db.transaction(async (tx) => {
          for (const line of priced.lines) {
            const reserved = await tx
              .update(products)
              .set({ stock: sql`${products.stock} - ${line.cases}` })
              .where(and(eq(products.id, line.productId), gte(products.stock, line.cases)))
              .returning({ id: products.id });
            if (reserved.length === 0) throw new StockShortError(line.name);
          }

          const [created] = await tx
            .insert(orders)
            .values({
              orderNumber,
              userId: user?.id ?? null,
              email,
              customerName: name,
              company: (body.company ?? user?.company ?? "").trim() || null,
              phone: (body.phone ?? "").trim() || null,
              status: "processing",
              shippingAddress,
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
          if (!created) throw new Error("Order insert returned no row.");

          await tx.insert(orderItems).values(
            priced.lines.map((line) => ({
              orderId: created.id,
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
          return created;
        });
      } catch (error) {
        if (error instanceof StockShortError) {
          return Response.json(
            { error: `${error.productName} no longer has enough stock. Please update your cart.` },
            { status: 409 },
          );
        }
        const constraint = pgConstraint(error);
        if (constraint === "orders_number_unique" && attempt < MAX_ATTEMPTS) continue;
        if (constraint === "orders_payment_ref_unique") {
          return Response.json({ error: "This payment has already been used for an order." }, { status: 409 });
        }
        throw error;
      }
    }
    if (!order) return Response.json({ error: "Could not create the order. No payment was taken." }, { status: 500 });

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
