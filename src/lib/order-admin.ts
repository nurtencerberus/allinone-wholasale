import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { pgConstraint } from "@/db/errors";
import {
  orderItemLots,
  orderItems,
  orders,
  returnItems,
  returnRequests,
  type Order,
  type OrderItem,
} from "@/db/schema";
import { stripeClient } from "@/lib/card-checkout";
import { escapeHtml, sendEmail } from "@/lib/email";
import { adjustLot, returnToLot, type Tx } from "@/lib/inventory";
import { formatMoney } from "@/lib/money";
import { cancelOrderAndRestock, recordOrderEvent } from "@/lib/orders";
import { appOrigin, SITE } from "@/lib/site";

/**
 * Order lifecycle (ODE-4): allowed status transitions, cancellation with refund, and
 * returns (RMA) with the 14-day policy. Opened food and supplements never go back on sale.
 */

export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  processing: ["picking", "cancelled"],
  picking: ["processing", "shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Payment states in which goods may leave the warehouse. */
export const SHIPPABLE_PAYMENT = ["paid", "paid_demo", "net30_invoice"] as const;

export const RETURN_WINDOW_DAYS = 14;
export const RETURN_REASONS = ["damaged", "wrong_item", "not_as_described", "expired_or_short_dated", "no_longer_needed", "other"] as const;
export const RETURN_CONDITIONS = ["sealed", "opened", "damaged"] as const;
export const RETURN_DISPOSITIONS = ["restock", "quarantine", "destroy"] as const;

export type Actor = { id: number; email: string };
export class OrderActionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function allowedTransitions(status: string): readonly string[] {
  return ORDER_TRANSITIONS[status] ?? [];
}

const PAYMENT_LABEL: Record<string, string> = {
  paid: "Paid",
  paid_demo: "Paid (demo)",
  authorized: "Card authorised",
  net30_invoice: "Net-30 invoice open",
  awaiting_payment: "Awaiting ACH / wire",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  refund_pending: "Refund failed — retry",
  refund_due: "Bank refund due",
  void: "Void (nothing charged)",
  capture_failed: "Card capture failed",
};

export function paymentLabel(status: string): string {
  return PAYMENT_LABEL[status] ?? status;
}

async function loadOrder(orderId: number): Promise<Order> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new OrderActionError("Order not found.", 404);
  return order;
}

// Status ---------------------------------------------------------------------------------

function trackingUrlFor(carrier: string, trackingNumber: string): string | null {
  const normalized = carrier.toLowerCase();
  const code = encodeURIComponent(trackingNumber);
  if (normalized.includes("ups")) return `https://www.ups.com/track?tracknum=${code}`;
  if (normalized.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
  if (normalized.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`;
  return null;
}

export async function changeOrderStatus(
  orderId: number,
  to: string,
  actor: Actor,
  options: { trackingNumber?: string | null; carrier?: string | null } = {},
): Promise<Order> {
  const order = await loadOrder(orderId);
  if (to === "cancelled") throw new OrderActionError("Use Cancel order — it also returns stock and refunds payment.");
  if (!allowedTransitions(order.status).includes(to)) {
    throw new OrderActionError(`An order that is ${order.status} cannot move to ${to}.`, 409);
  }
  const carrier = (options.carrier ?? order.shippingCarrier).trim().slice(0, 40) || order.shippingCarrier;
  const trackingNumber = (options.trackingNumber ?? order.trackingNumber ?? "").trim().slice(0, 60) || null;
  if (to === "shipped") {
    if (!(SHIPPABLE_PAYMENT as readonly string[]).includes(order.paymentStatus)) {
      throw new OrderActionError(`Payment is “${paymentLabel(order.paymentStatus)}”. Goods ship only once it is settled.`, 409);
    }
    if (!trackingNumber) throw new OrderActionError("Enter the tracking or PRO number before marking the order shipped.");
  }

  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(orders)
      .set({
        status: to,
        shippingCarrier: carrier,
        trackingNumber,
        trackingUrl: trackingNumber ? trackingUrlFor(carrier, trackingNumber) : null,
        ...(to === "shipped" ? { shippedAt: now } : {}),
        ...(to === "delivered" ? { deliveredAt: now } : {}),
        updatedAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
      .returning();
    if (!rows.length) throw new OrderActionError("The order changed while you were editing it. Reload and try again.", 409);
    await recordOrderEvent(tx, {
      orderId,
      type: "status",
      from: order.status,
      to,
      message: to === "shipped" ? `${carrier} ${trackingNumber}` : null,
      actor,
      visibleToCustomer: to !== "processing",
    });
    return rows;
  });

  if (to === "shipped") {
    await notifyCustomer(order, `Order ${order.orderNumber} has shipped`, `Order <strong>${order.orderNumber}</strong> is on the way with ${escapeHtml(carrier)}. Tracking / PRO number: <strong>${escapeHtml(trackingNumber ?? "")}</strong>. Lot numbers are printed on the packing slip.`);
  }
  return updated;
}

export async function updateTracking(orderId: number, actor: Actor, carrier: string, trackingNumber: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (!["picking", "shipped"].includes(order.status)) {
    throw new OrderActionError("Tracking can be set while picking or after shipping.", 409);
  }
  const cleanCarrier = carrier.trim().slice(0, 40) || order.shippingCarrier;
  const cleanNumber = trackingNumber.trim().slice(0, 60) || null;
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        shippingCarrier: cleanCarrier,
        trackingNumber: cleanNumber,
        trackingUrl: cleanNumber ? trackingUrlFor(cleanCarrier, cleanNumber) : null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    await recordOrderEvent(tx, {
      orderId,
      type: "tracking",
      from: order.trackingNumber,
      to: cleanNumber,
      message: cleanCarrier,
      actor,
      visibleToCustomer: order.status === "shipped",
    });
  });
}

export async function addAdminNote(orderId: number, actor: Actor, note: string): Promise<void> {
  const text = note.trim().slice(0, 2000);
  if (!text) throw new OrderActionError("The note is empty.");
  const stamp = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${actor.email}] ${text}`;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ adminNotes: sql`concat_ws(E'\\n', ${orders.adminNotes}, ${stamp}::text)`, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id });
    if (!row) throw new OrderActionError("Order not found.", 404);
    await recordOrderEvent(tx, { orderId, type: "note", message: text, actor });
  });
}

/** Funds received for an ACH / wire order or a Net-30 invoice. */
export async function markPaid(orderId: number, actor: Actor, reference: string | null): Promise<void> {
  const order = await loadOrder(orderId);
  if (order.status === "cancelled") throw new OrderActionError("This order is cancelled.", 409);
  if (order.paymentStatus !== "awaiting_payment" && order.paymentStatus !== "net30_invoice") {
    throw new OrderActionError("This order has no outstanding balance to mark as paid.", 409);
  }
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(orders)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, order.paymentStatus)))
      .returning({ id: orders.id });
    if (!rows.length) throw new OrderActionError("Payment status changed meanwhile. Reload.", 409);
    await recordOrderEvent(tx, {
      orderId,
      type: "payment",
      from: order.paymentStatus,
      to: "paid",
      message: reference ? `Reference ${reference.slice(0, 80)}` : null,
      actor,
      visibleToCustomer: true,
    });
  });
}

// Money back ------------------------------------------------------------------------------

type RefundOutcome =
  | { ok: true; method: "stripe" | "demo" | "credit" | "manual"; ref: string | null }
  | { ok: false; error: string };

/**
 * Returns `amount` cents to the buyer the way they paid. Card payments go back through Stripe
 * (idempotent per `key`); unpaid invoices are credited; settled bank payments are recorded as a
 * bank refund the trade desk must send.
 */
async function sendRefund(order: Order, amount: number, key: string): Promise<RefundOutcome> {
  if (amount <= 0) return { ok: true, method: "credit", ref: null };
  if (order.paymentStatus === "paid_demo") return { ok: true, method: "demo", ref: `demo_refund_${key}` };
  if (order.paymentStatus === "net30_invoice" || order.paymentStatus === "awaiting_payment") {
    return { ok: true, method: "credit", ref: null };
  }
  if (order.paymentMethod === "card" && order.paymentRef?.startsWith("pi_")) {
    const stripe = stripeClient();
    if (!stripe) return { ok: false, error: "Card refunds need the Stripe key — refund in the Stripe dashboard, then record it." };
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: order.paymentRef, amount, reason: "requested_by_customer", metadata: { order: order.orderNumber } },
        { idempotencyKey: `refund:${key}` },
      );
      return { ok: true, method: "stripe", ref: refund.id };
    } catch (error) {
      console.error("[refund]", order.orderNumber, error);
      return { ok: false, error: error instanceof Error ? error.message : "Stripe refused the refund." };
    }
  }
  return { ok: true, method: "manual", ref: null };
}

function paymentStatusAfterRefund(order: Order, refundedTotal: number, method: RefundOutcome & { ok: true }): string {
  if (method.method === "credit") return refundedTotal >= order.total ? "void" : order.paymentStatus;
  if (method.method === "manual") return "refund_due";
  return refundedTotal >= order.total ? "refunded" : "partially_refunded";
}

/** Cancels an unshipped order: stock back to its lots, then the payment back to the buyer. */
export async function cancelOrder(
  orderId: number,
  actor: Actor,
  reason: string,
): Promise<{ order: Order; refund: RefundOutcome | null }> {
  const order = await loadOrder(orderId);
  if (!["processing", "picking"].includes(order.status)) {
    throw new OrderActionError(
      order.status === "cancelled" ? "This order is already cancelled." : "Shipped orders are not cancelled — open a return instead.",
      409,
    );
  }
  const why = reason.trim().slice(0, 300) || "Cancelled by the trade desk";
  const done = await cancelOrderAndRestock(orderId, why, actor);
  if (!done) throw new OrderActionError("The order changed meanwhile. Reload and try again.", 409);

  const due = order.total - order.refundedAmount;
  if (order.paymentStatus === "authorized" && order.paymentRef) {
    try {
      await stripeClient()?.paymentIntents.cancel(order.paymentRef, undefined, { idempotencyKey: `cancel:${order.paymentRef}` });
    } catch (error) {
      console.error("[cancel-authorization]", order.orderNumber, error);
    }
    await setPayment(order, "void", 0, actor, "Card authorisation released");
    return { order: await loadOrder(orderId), refund: null };
  }
  const refund = await sendRefund(order, due, `cancel:${order.orderNumber}`);
  if (!refund.ok) {
    await setPayment(order, "refund_pending", 0, actor, `Refund of ${formatMoney(due)} failed: ${refund.error}`);
  } else {
    await setPayment(order, paymentStatusAfterRefund(order, order.total, refund), refund.method === "credit" ? 0 : due, actor, refundMessage(refund, due));
  }
  await notifyCustomer(order, `Order ${order.orderNumber} was cancelled`, `Order <strong>${order.orderNumber}</strong> was cancelled: ${escapeHtml(why)}. ${refund.ok && (refund.method === "stripe" || refund.method === "demo") ? `${formatMoney(due)} is on its way back to your card (5–10 business days).` : refund.ok && refund.method === "manual" ? `We will send ${formatMoney(due)} back by bank transfer.` : "Nothing further is owed on this order."}`);
  return { order: await loadOrder(orderId), refund };
}

function refundMessage(refund: RefundOutcome & { ok: true }, amount: number): string {
  if (refund.method === "credit") return `Invoice cancelled — ${formatMoney(amount)} no longer due`;
  if (refund.method === "manual") return `Send a bank refund of ${formatMoney(amount)}, then record it`;
  return `${formatMoney(amount)} refunded to card${refund.ref ? ` (${refund.ref})` : ""}`;
}

async function setPayment(order: Order, status: string, addRefunded: number, actor: Actor, message: string, tx?: Tx) {
  const run = async (trx: Tx) => {
    await trx
      .update(orders)
      .set({ paymentStatus: status, refundedAmount: sql`${orders.refundedAmount} + ${addRefunded}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await recordOrderEvent(trx, {
      orderId: order.id,
      type: addRefunded > 0 ? "refund" : "payment",
      from: order.paymentStatus,
      to: status,
      message,
      actor,
      visibleToCustomer: status !== "refund_pending",
    });
  };
  return tx ? run(tx) : db.transaction(run);
}

/** Retries a card refund that failed during cancellation (same idempotency key). */
export async function retryCancellationRefund(orderId: number, actor: Actor): Promise<RefundOutcome> {
  const order = await loadOrder(orderId);
  if (order.paymentStatus !== "refund_pending" || order.status !== "cancelled") {
    throw new OrderActionError("There is no failed refund to retry on this order.", 409);
  }
  const due = order.total - order.refundedAmount;
  const refund = await sendRefund({ ...order, paymentStatus: "paid" }, due, `cancel:${order.orderNumber}`);
  if (refund.ok) {
    await setPayment(order, paymentStatusAfterRefund(order, order.total, refund), refund.method === "credit" ? 0 : due, actor, refundMessage(refund, due));
  } else {
    await recordOrderEvent(db, { orderId, type: "payment", message: `Refund retry failed: ${refund.error}`, actor });
  }
  return refund;
}

/** The trade desk sent a bank refund for an ACH / wire order. */
export async function recordBankRefund(orderId: number, actor: Actor, reference: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (order.paymentStatus !== "refund_due") throw new OrderActionError("No bank refund is due on this order.", 409);
  const ref = reference.trim().slice(0, 80);
  if (!ref) throw new OrderActionError("Enter the bank transfer reference.");
  await setPayment(order, order.refundedAmount >= order.total ? "refunded" : "partially_refunded", 0, actor, `Bank refund sent · ${ref}`);
}

// Returns (RMA) -----------------------------------------------------------------------------

export function returnDeadline(order: Pick<Order, "deliveredAt" | "shippedAt" | "status">): Date | null {
  const from = order.deliveredAt ?? (order.status === "shipped" || order.status === "delivered" ? order.shippedAt : null);
  return from ? new Date(from.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000) : null;
}

export function returnEligibility(order: Pick<Order, "deliveredAt" | "shippedAt" | "status">, now = new Date()) {
  const deadline = returnDeadline(order);
  if (!deadline) return { eligible: false, deadline: null, reason: "Returns open once the order has shipped." };
  if (now > deadline) return { eligible: false, deadline, reason: `The ${RETURN_WINDOW_DAYS}-day return window closed.` };
  return { eligible: true, deadline, reason: null };
}

/** Cases of each line already claimed by return requests that were not rejected. */
async function claimedCases(orderId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ orderItemId: returnItems.orderItemId, cases: sql<number>`sum(${returnItems.cases})::int` })
    .from(returnItems)
    .innerJoin(returnRequests, eq(returnRequests.id, returnItems.returnId))
    .where(and(eq(returnRequests.orderId, orderId), ne(returnRequests.status, "rejected")))
    .groupBy(returnItems.orderItemId);
  return new Map(rows.map((row) => [row.orderItemId, row.cases]));
}

export async function returnableLines(orderId: number): Promise<(OrderItem & { returnable: number })[]> {
  const [lines, claimed] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id)),
    claimedCases(orderId),
  ]);
  return lines.map((line) => ({ ...line, returnable: Math.max(0, line.cases - (claimed.get(line.id) ?? 0)) }));
}

export async function requestReturn(input: {
  order: Order;
  userId: number;
  items: { orderItemId: number; cases: number }[];
  reason: string;
  note: string | null;
}): Promise<{ id: number; rmaNumber: string }> {
  const { order } = input;
  const eligibility = returnEligibility(order);
  if (!eligibility.eligible) throw new OrderActionError(eligibility.reason ?? "This order cannot be returned.", 409);
  if (!(RETURN_REASONS as readonly string[]).includes(input.reason)) throw new OrderActionError("Choose a return reason.");

  const lines = await returnableLines(order.id);
  const byId = new Map(lines.map((line) => [line.id, line]));
  const wanted = input.items.filter((item) => Number.isInteger(item.cases) && item.cases > 0);
  if (!wanted.length) throw new OrderActionError("Choose at least one case to return.");
  for (const item of wanted) {
    const line = byId.get(item.orderItemId);
    if (!line) throw new OrderActionError("That item is not on this order.");
    if (item.cases > line.returnable) {
      throw new OrderActionError(`${line.name}: at most ${line.returnable} case(s) can still be returned.`);
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rmaNumber = `RMA-${randomInt(100000, 1000000)}`;
    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(returnRequests)
          .values({
            rmaNumber,
            orderId: order.id,
            userId: input.userId,
            reason: input.reason,
            customerNote: input.note?.trim().slice(0, 1000) || null,
          })
          .returning({ id: returnRequests.id, rmaNumber: returnRequests.rmaNumber });
        await tx.insert(returnItems).values(wanted.map((item) => ({ returnId: row.id, orderItemId: item.orderItemId, cases: item.cases })));
        await recordOrderEvent(tx, {
          orderId: order.id,
          type: "return",
          to: "requested",
          message: `${rmaNumber} requested: ${wanted.reduce((sum, item) => sum + item.cases, 0)} case(s), ${input.reason.replace(/_/g, " ")}`,
          actor: "customer",
          visibleToCustomer: true,
        });
        return row;
      });
      try {
        await sendEmail({
          to: process.env.OPS_EMAIL?.trim() || SITE.email,
          subject: `Return request ${created.rmaNumber} for ${order.orderNumber}`,
          html: `<p>${escapeHtml(order.company ?? order.customerName)} requested a return on ${order.orderNumber} (${escapeHtml(input.reason.replace(/_/g, " "))}).</p><p><a href="${appOrigin()}/admin/returns">Review returns</a></p>`,
        });
      } catch (error) {
        console.error("[return-email]", error);
      }
      return created;
    } catch (error) {
      if (pgConstraint(error) === "return_requests_rma_unique") continue;
      throw error;
    }
  }
  throw new OrderActionError("Could not create the return. Try again.", 500);
}

async function loadReturn(returnId: number) {
  const [row] = await db
    .select({ rma: returnRequests, order: orders })
    .from(returnRequests)
    .innerJoin(orders, eq(orders.id, returnRequests.orderId))
    .where(eq(returnRequests.id, returnId))
    .limit(1);
  if (!row) throw new OrderActionError("Return not found.", 404);
  return row;
}

export async function decideReturn(returnId: number, actor: Actor, approve: boolean, note: string): Promise<void> {
  const { rma, order } = await loadReturn(returnId);
  if (rma.status !== "requested") throw new OrderActionError(`This return is already ${rma.status}.`, 409);
  const text = note.trim().slice(0, 1000);
  if (!approve && text.length < 5) throw new OrderActionError("Give the buyer a reason for the rejection.");
  const status = approve ? "approved" : "rejected";
  await db.transaction(async (tx) => {
    await tx.update(returnRequests).set({ status, adminNote: text || null, updatedAt: new Date() }).where(eq(returnRequests.id, returnId));
    await recordOrderEvent(tx, { orderId: order.id, type: "return", from: "requested", to: status, message: `${rma.rmaNumber}${text ? ` · ${text}` : ""}`, actor, visibleToCustomer: true });
  });
  await notifyCustomer(
    order,
    `Return ${rma.rmaNumber} ${status}`,
    approve
      ? `Your return <strong>${rma.rmaNumber}</strong> for order ${order.orderNumber} is approved. Write the RMA number on each carton and ship to ${escapeHtml(SITE.address)}.${text ? ` Note: ${escapeHtml(text)}` : ""}`
      : `Your return <strong>${rma.rmaNumber}</strong> for order ${order.orderNumber} was not approved: ${escapeHtml(text)}`,
  );
}

/**
 * Cartons arrived: record each line's condition and where it goes. Sealed cartons may go back
 * on sale; opened or damaged cartons never do (quarantine, or destroy with a write-off).
 */
export async function receiveReturn(
  returnId: number,
  actor: Actor,
  decisions: { returnItemId: number; condition: string; disposition: string }[],
): Promise<void> {
  const { rma, order } = await loadReturn(returnId);
  if (rma.status !== "approved") throw new OrderActionError("Only an approved return can be received.", 409);
  const items = await db
    .select({ item: returnItems, line: orderItems })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(eq(returnItems.returnId, returnId));
  const decisionById = new Map(decisions.map((entry) => [entry.returnItemId, entry]));
  for (const { item } of items) {
    const decision = decisionById.get(item.id);
    if (!decision) throw new OrderActionError("Record the condition of every returned line.");
    if (!(RETURN_CONDITIONS as readonly string[]).includes(decision.condition) || !(RETURN_DISPOSITIONS as readonly string[]).includes(decision.disposition)) {
      throw new OrderActionError("Unknown condition or disposition.");
    }
    if (decision.disposition === "restock" && decision.condition !== "sealed") {
      throw new OrderActionError("Only sealed cartons can go back on sale. Quarantine or destroy opened and damaged goods.");
    }
  }

  await db.transaction(async (tx) => {
    for (const { item, line } of items) {
      const decision = decisionById.get(item.id)!;
      await tx.update(returnItems).set({ condition: decision.condition, disposition: decision.disposition }).where(eq(returnItems.id, item.id));
      await tx.update(orderItems).set({ returnedCases: sql`${orderItems.returnedCases} + ${item.cases}` }).where(eq(orderItems.id, line.id));
      if (line.productId === null) continue;

      // Put the cases back against the lots they shipped from.
      const lots = await tx
        .select()
        .from(orderItemLots)
        .where(eq(orderItemLots.orderItemId, line.id))
        .orderBy(asc(orderItemLots.id))
        .for("update");
      let remaining = item.cases;
      for (const lot of lots) {
        if (remaining === 0) break;
        const take = Math.min(remaining, lot.cases - lot.returnedCases);
        if (take <= 0) continue;
        remaining -= take;
        await tx.update(orderItemLots).set({ returnedCases: lot.returnedCases + take }).where(eq(orderItemLots.id, lot.id));
        await returnToLot(tx, {
          productId: line.productId,
          lotId: lot.lotId,
          lotNumber: lot.lotNumber,
          expiresOn: lot.expiresOn,
          cases: take,
          bucket: decision.disposition === "restock" ? "on_hand" : "quarantine",
          reason: "return",
          refType: "return",
          refId: rma.rmaNumber,
          note: `${decision.condition} → ${decision.disposition}`,
          actorId: actor.id,
        });
        if (decision.disposition === "destroy" && lot.lotId !== null) {
          await adjustLot(tx, {
            lotId: lot.lotId,
            delta: -take,
            bucket: "quarantine",
            reason: "writeoff",
            note: `Destroyed on return ${rma.rmaNumber} (${decision.condition})`,
            refType: "return",
            refId: rma.rmaNumber,
            actorId: actor.id,
          });
        }
      }
    }
    await tx.update(returnRequests).set({ status: "received", receivedAt: new Date(), updatedAt: new Date() }).where(eq(returnRequests.id, returnId));
    await recordOrderEvent(tx, { orderId: order.id, type: "return", from: "approved", to: "received", message: rma.rmaNumber, actor, visibleToCustomer: true });
  });
}

/** What a return is worth: each line's net price and tax, pro rata by case, without rounding drift. */
export async function computeReturnRefund(returnId: number, includeShipping: boolean) {
  const { rma, order } = await loadReturn(returnId);
  const items = await db
    .select({ item: returnItems, line: orderItems })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(eq(returnItems.returnId, returnId));
  // Cases of each line refunded by earlier returns of this order.
  const earlier = await db
    .select({ orderItemId: returnItems.orderItemId, cases: sql<number>`sum(${returnItems.cases})::int` })
    .from(returnItems)
    .innerJoin(returnRequests, eq(returnRequests.id, returnItems.returnId))
    .where(and(eq(returnRequests.orderId, order.id), eq(returnRequests.status, "refunded")))
    .groupBy(returnItems.orderItemId);
  const before = new Map(earlier.map((row) => [row.orderItemId, row.cases]));

  let goods = 0;
  let tax = 0;
  for (const { item, line } of items) {
    const done = before.get(line.id) ?? 0;
    const after = done + item.cases;
    const net = line.lineTotal - line.discount;
    goods += Math.round((net * after) / line.cases) - Math.round((net * done) / line.cases);
    tax += Math.round((line.taxAmount * after) / line.cases) - Math.round((line.taxAmount * done) / line.cases);
  }
  let shipping = 0;
  if (includeShipping) {
    const [prior] = await db
      .select({ value: sql<number>`coalesce(sum(${returnRequests.refundShipping}), 0)::int` })
      .from(returnRequests)
      .where(and(eq(returnRequests.orderId, order.id), inArray(returnRequests.status, ["refunded"])));
    shipping = (prior?.value ?? 0) > 0 ? 0 : order.shippingCost + order.shippingTax;
  }
  const cap = order.total - order.refundedAmount;
  const total = Math.min(cap, goods + tax + shipping);
  return { rma, order, goods, tax, shipping, total };
}

export async function refundReturn(returnId: number, actor: Actor, includeShipping: boolean): Promise<RefundOutcome & { amount: number }> {
  const { rma, order, goods, tax, shipping, total } = await computeReturnRefund(returnId, includeShipping);
  if (rma.status !== "received") throw new OrderActionError("Receive and inspect the cartons before refunding.", 409);
  const refund = await sendRefund(order, total, `return:${rma.rmaNumber}`);
  if (!refund.ok) {
    await recordOrderEvent(db, { orderId: order.id, type: "refund", message: `${rma.rmaNumber} refund failed: ${refund.error}`, actor });
    return { ...refund, amount: total };
  }
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(returnRequests)
      .set({ status: "refunded", refundGoods: goods, refundTax: tax, refundShipping: shipping, refundRef: refund.ref, refundedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(returnRequests.id, returnId), eq(returnRequests.status, "received")))
      .returning({ id: returnRequests.id });
    if (!rows.length) throw new OrderActionError("This return was refunded meanwhile.", 409);
    await setPayment(order, paymentStatusAfterRefund(order, order.refundedAmount + total, refund), total, actor, `${rma.rmaNumber}: ${refundMessage(refund, total)}`, tx);
  });
  await notifyCustomer(order, `Refund for return ${rma.rmaNumber}`, `We received your return <strong>${rma.rmaNumber}</strong>. ${refund.method === "credit" ? `${formatMoney(total)} was credited against your invoice.` : refund.method === "manual" ? `${formatMoney(total)} will be returned by bank transfer.` : `${formatMoney(total)} is on its way back to your card (5–10 business days).`}`);
  return { ...refund, amount: total };
}

async function notifyCustomer(order: Order, subject: string, html: string) {
  try {
    await sendEmail({
      to: order.email,
      subject,
      html: `<p>Hi ${escapeHtml(order.customerName.split(" ")[0])},</p><p>${html}</p><p><a href="${appOrigin()}/order/${order.orderNumber}">View the order</a></p><p>— ${escapeHtml(SITE.name)} trade desk</p>`,
      replyTo: SITE.email,
    });
  } catch (error) {
    console.error("[order-email]", order.orderNumber, error);
  }
}
