import { randomInt } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pgConstraint } from "@/db/errors";
import { couponRedemptions, coupons, orderEvents, orderItemLots, orderItems, orders } from "@/db/schema";
import { couponProblem, type PricedOrder } from "@/lib/checkout";
import { orderConfirmationTemplate, sendEmail } from "@/lib/email";
import { allocateFefo, returnToLot, StockShortError, type Tx } from "@/lib/inventory";
import { formatMoney } from "@/lib/money";
import { randomToken } from "@/lib/password";
import { appOrigin, SITE } from "@/lib/site";

export { StockShortError };

const MAX_NUMBER_ATTEMPTS = 3;

type EventExecutor = Pick<typeof db, "insert">;

/** Appends one entry to an order's history. */
export async function recordOrderEvent(
  executor: EventExecutor | Tx,
  event: {
    orderId: number;
    type: "status" | "payment" | "refund" | "return" | "note" | "tracking" | "created";
    from?: string | null;
    to?: string | null;
    message?: string | null;
    actor?: { id: number; email: string } | "system" | "customer";
    visibleToCustomer?: boolean;
  },
): Promise<void> {
  const actor = event.actor ?? "system";
  await executor.insert(orderEvents).values({
    orderId: event.orderId,
    type: event.type,
    fromValue: event.from ?? null,
    toValue: event.to ?? null,
    message: event.message ?? null,
    actorId: typeof actor === "object" ? actor.id : null,
    actorLabel: typeof actor === "object" ? actor.email : actor,
    visibleToCustomer: Boolean(event.visibleToCustomer),
  });
}

/** The coupon was still valid when the cart was priced but not when the order was written. */
export class CouponUnavailableError extends Error {}

export class DuplicatePaymentError extends Error {
  constructor() {
    super("This payment has already been used for an order.");
  }
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
 * Writes the order, its lines and their lot allocations in one transaction: either all of it
 * happens or none of it. Stock is taken first-expired-first-out from sellable lots
 * (src/lib/inventory.ts), so concurrent orders can never drive it negative.
 */
export async function createOrderRecord(input: {
  priced: PricedOrder;
  userId: number;
  /** The company the buyer belongs to, so colleagues can see the order (UX-7). */
  companyId?: number | null;
  contact: OrderContact;
  address: OrderAddress;
  paymentMethod: "card" | "net30" | "ach";
  paymentStatus: string;
  paymentRef: string | null;
  poNumber: string | null;
  idempotencyKey: string | null;
  /** Resale certificate the exemption relied on, for the tax record. */
  exemptionCert?: string | null;
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
        const [row] = await tx
          .insert(orders)
          .values({
            orderNumber,
            userId: input.userId,
            companyId: input.companyId ?? null,
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
            taxSource: priced.taxQuote.source,
            taxableAmount: priced.taxQuote.taxableAmount,
            shippingTaxable: priced.taxAllocation.shippingTaxable,
            shippingTax: priced.taxAllocation.shippingTax,
            exemptionCert: input.exemptionCert ?? null,
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

        const items = await tx
          .insert(orderItems)
          .values(
            priced.lines.map((line, index) => ({
              orderId: row.id,
              productId: line.productId,
              name: line.name,
              sku: line.sku,
              image: line.image,
              cases: line.cases,
              unitsPerCase: line.caseSize,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              discount: line.lineTotal - priced.lineNet[index],
              taxClass: line.taxClass,
              taxableAmount: priced.taxAllocation.lines[index]?.taxable ?? 0,
              taxAmount: priced.taxAllocation.lines[index]?.tax ?? 0,
            })),
          )
          .returning({ id: orderItems.id });

        // Coupon use is counted in the same transaction as the order, with the coupon row locked:
        // two orders placed at once cannot both take the last redemption, and an order that
        // fails later never burns one. The rules are checked again here against fresh counts.
        if (priced.couponId) {
          const [coupon] = await tx.select().from(coupons).where(eq(coupons.id, priced.couponId)).for("update").limit(1);
          if (!coupon) throw new CouponUnavailableError(`Coupon ${priced.couponCode} is no longer available.`);
          let customerRedemptions = 0;
          if (coupon.perCustomerLimit !== null) {
            const [used] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(couponRedemptions)
              .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)));
            customerRedemptions = used?.count ?? 0;
          }
          const problem = couponProblem(coupon, {
            now: new Date(),
            eligibleBase: priced.lines.reduce((sum, line) => sum + line.lineTotal, 0),
            accountDiscount: priced.accountDiscount,
            accountTier: priced.accountTier,
            customerRedemptions,
          });
          if (problem) throw new CouponUnavailableError(problem);
          await tx
            .update(coupons)
            .set({ redeemedCount: coupon.redeemedCount + 1 })
            .where(eq(coupons.id, coupon.id));
          await tx.insert(couponRedemptions).values({
            couponId: coupon.id,
            orderId: row.id,
            userId: input.userId,
            email: input.contact.email,
            amount: priced.couponDiscount,
          });
        }

        // Lock products in id order so two orders for the same items cannot deadlock.
        const byProduct = [...priced.lines.entries()].sort((a, b) => a[1].productId - b[1].productId);
        for (const [index, line] of byProduct) {
          const allocations = await allocateFefo(tx, {
            productId: line.productId,
            productName: line.name,
            cases: line.cases,
            orderId: row.id,
          });
          await tx.insert(orderItemLots).values(
            allocations.map((allocation) => ({ orderItemId: items[index].id, ...allocation })),
          );
        }

        await recordOrderEvent(tx, {
          orderId: row.id,
          type: "created",
          to: "processing",
          message: `Order placed · ${input.paymentMethod.toUpperCase()} · ${input.paymentStatus}`,
          actor: "customer",
          visibleToCustomer: true,
        });
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

/** Lot that receives stock for order lines placed before lots existed. */
export function legacyLotNumber(sku: string): string {
  return `${sku}-LEGACY`.slice(0, 40);
}

/**
 * Cancels an order that has not shipped and returns its cases to the lots they came from,
 * once. Returns false if it was already cancelled or shipped. Money is handled by the caller
 * (src/lib/order-admin.ts refunds card payments).
 */
export async function cancelOrderAndRestock(
  orderId: number,
  reason: string,
  actor: { id: number; email: string } | "system" = "system",
  tx?: Tx,
): Promise<boolean> {
  const run = async (trx: Tx) => {
    const [cancelled] = await trx
      .update(orders)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["processing", "picking"])))
      .returning({ id: orders.id, status: orders.status });
    if (!cancelled) return false;
    const lines = await trx
      .select({ item: orderItems, lot: orderItemLots })
      .from(orderItems)
      .leftJoin(orderItemLots, eq(orderItemLots.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, orderId));
    for (const { item, lot } of lines) {
      if (item.productId === null) continue;
      if (!lot) {
        // Placed before stock moved into lots (Faz 1): the cases go back into a catch-all lot.
        await returnToLot(trx, {
          productId: item.productId,
          lotId: null,
          lotNumber: legacyLotNumber(item.sku),
          expiresOn: null,
          cases: item.cases,
          bucket: "on_hand",
          reason: "cancel",
          refType: "order",
          refId: orderId,
          actorId: typeof actor === "object" ? actor.id : null,
        });
        continue;
      }
      await returnToLot(trx, {
        productId: item.productId,
        lotId: lot.lotId,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        cases: lot.cases - lot.returnedCases,
        bucket: "on_hand",
        reason: "cancel",
        refType: "order",
        refId: orderId,
        actorId: typeof actor === "object" ? actor.id : null,
      });
      await trx.update(orderItemLots).set({ returnedCases: lot.cases }).where(eq(orderItemLots.id, lot.id));
    }
    await recordOrderEvent(trx, {
      orderId,
      type: "status",
      to: "cancelled",
      message: reason,
      actor,
      visibleToCustomer: true,
    });
    return true;
  };
  return tx ? run(tx) : db.transaction(run);
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
