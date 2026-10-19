import { randomInt } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import type { PricedOrder } from "@/lib/checkout";
import { orderConfirmationTemplate, sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/money";
import { randomToken } from "@/lib/password";
import { appOrigin, SITE } from "@/lib/site";

const MAX_NUMBER_ATTEMPTS = 3;

/** Thrown inside the order transaction when a line can no longer be reserved. */
export class StockShortError extends Error {
  constructor(public readonly productName: string) {
    super(`${productName} no longer has enough stock.`);
  }
}

export class DuplicatePaymentError extends Error {
  constructor() {
    super("This payment has already been used for an order.");
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

export type OrderContact = {
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  notes: string | null;
};

export type OrderAddress = { line1: string; line2?: string; city: string; state: string; zip: string; country?: string };

export type CreatedOrder = { id: number; orderNumber: string; accessToken: string };

/**
 * Reserves stock and writes the order and its lines in one transaction: either all of it
 * happens or none of it. Stock is decremented only where enough remains, so concurrent
 * orders can never drive it negative.
 */
export async function createOrderRecord(input: {
  priced: PricedOrder;
  userId: number;
  contact: OrderContact;
  address: OrderAddress;
  paymentMethod: "card" | "net30" | "ach";
  paymentStatus: string;
  paymentRef: string | null;
  poNumber: string | null;
  idempotencyKey: string | null;
}): Promise<CreatedOrder> {
  const { priced } = input;
  const accessToken = randomToken(16);
  const shippingAddress = {
    line1: input.address.line1,
    line2: input.address.line2 ?? "",
    city: input.address.city,
    state: input.address.state,
    zip: input.address.zip,
    country: input.address.country ?? "United States",
  };

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    const orderNumber = newOrderNumber();
    try {
      const created = await db.transaction(async (tx) => {
        for (const line of priced.lines) {
          const reserved = await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${line.cases}` })
            .where(and(eq(products.id, line.productId), gte(products.stock, line.cases)))
            .returning({ id: products.id });
          if (reserved.length === 0) throw new StockShortError(line.name);
        }

        const [row] = await tx
          .insert(orders)
          .values({
            orderNumber,
            userId: input.userId,
            email: input.contact.email,
            customerName: input.contact.name,
            company: input.contact.company,
            phone: input.contact.phone,
            status: "processing",
            shippingAddress,
            shippingService: priced.shippingService ?? "Ground",
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
            paymentStatus: input.paymentStatus,
            paymentMethod: input.paymentMethod,
            poNumber: input.poNumber,
            accessToken,
            paymentRef: input.paymentRef,
            idempotencyKey: input.idempotencyKey,
            notes: input.contact.notes,
          })
          .returning({ id: orders.id, orderNumber: orders.orderNumber });
        if (!row) throw new Error("Order insert returned no row.");

        await tx.insert(orderItems).values(
          priced.lines.map((line) => ({
            orderId: row.id,
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
        return row;
      });
      return { ...created, accessToken };
    } catch (error) {
      const constraint = pgConstraint(error);
      if (constraint === "orders_number_unique" && attempt < MAX_NUMBER_ATTEMPTS) continue;
      if (constraint === "orders_payment_ref_unique") throw new DuplicatePaymentError();
      throw error;
    }
  }
  throw new Error("Could not allocate an order number.");
}

/** Cancels an order and returns its cases to stock, once. Returns false if it was already cancelled. */
export async function cancelOrderAndRestock(orderId: number, reason: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(orders)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
        notes: sql`concat_ws(E'\n', ${orders.notes}, ${`[system] ${reason}`}::text)`,
      })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["processing", "picking"])))
      .returning({ id: orders.id });
    if (!cancelled) return false;
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const line of lines) {
      if (line.productId === null) continue;
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${line.cases}` })
        .where(eq(products.id, line.productId));
    }
    return true;
  });
}

export async function sendOrderConfirmation(order: CreatedOrder, contact: OrderContact, total: number) {
  const template = orderConfirmationTemplate({
    orderNumber: order.orderNumber,
    name: contact.name,
    total: formatMoney(total),
    url: `${appOrigin()}/order/${order.orderNumber}?t=${order.accessToken}`,
  });
  try {
    await sendEmail({ to: contact.email, subject: template.subject, html: template.html, replyTo: SITE.email });
  } catch (error) {
    // The order exists either way; a failed e-mail must not undo it.
    console.error("[order-email]", order.orderNumber, error);
  }
}
