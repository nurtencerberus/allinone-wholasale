import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Landmark,
  MapPin,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { db } from "@/db";
import { orderEvents, orderItemLots, orderItems, orders, products, returnRequests } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canViewOrder } from "@/lib/order-access";
import { CopyButton, OrderActions, type ReorderItem } from "@/components/order/OrderActions";
import { formatDate, formatDateTime, formatIsoDate, formatMoney, formatRate } from "@/lib/money";
import { paymentLabel, returnableLines, returnEligibility } from "@/lib/order-admin";
import { ReturnRequestForm } from "@/components/order/ReturnRequestForm";
import { SITE, stateName } from "@/lib/site";

export const metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

const STEPS = [
  { key: "processing", label: "Processing" },
  { key: "picking", label: "Picking & packing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

const PAYMENT: Record<string, { badge: string; headline: string; tone: "ok" | "wait" }> = {
  paid: { badge: "Order confirmed & payment captured", headline: "Payment captured", tone: "ok" },
  paid_demo: { badge: "Order confirmed · demo payment", headline: "Demo payment authorised", tone: "ok" },
  net30_invoice: { badge: "Order confirmed · invoiced on Net-30", headline: "Invoice on Net-30 terms", tone: "wait" },
  awaiting_payment: { badge: "Order reserved · awaiting ACH / wire", headline: "Awaiting payment", tone: "wait" },
  refunded: { badge: "Order refunded", headline: "Refunded", tone: "ok" },
  partially_refunded: { badge: "Order confirmed · partially refunded", headline: "Partially refunded", tone: "ok" },
  refund_due: { badge: "Refund being sent by bank transfer", headline: "Bank refund in progress", tone: "wait" },
  refund_pending: { badge: "Refund in progress", headline: "Refund in progress", tone: "wait" },
  void: { badge: "Order cancelled · nothing charged", headline: "Nothing charged", tone: "ok" },
};

const RETURN_STATUS: Record<string, string> = {
  requested: "Requested — awaiting review",
  approved: "Approved — ship the cartons with the RMA number",
  rejected: "Not approved",
  received: "Received — refund being processed",
  refunded: "Refunded",
};

const METHOD_LABEL: Record<string, string> = {
  card: "Credit card",
  net30: "Net-30 purchase order",
  ach: "ACH / wire transfer",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, number)).limit(1);
  if (!order) notFound();

  // Private to the buyer and the trade desk. Not-found and not-allowed look the same.
  const viewer = await getSessionUser();
  if (!(await canViewOrder(order, viewer, t))) notFound();

  const [items, lotRows, history, returns] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db
      .select({ lot: orderItemLots })
      .from(orderItemLots)
      .innerJoin(orderItems, eq(orderItems.id, orderItemLots.orderItemId))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItemLots.id)),
    db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.visibleToCustomer, true)))
      .orderBy(desc(orderEvents.createdAt), desc(orderEvents.id)),
    db.select().from(returnRequests).where(eq(returnRequests.orderId, order.id)).orderBy(desc(returnRequests.createdAt)),
  ]);
  const lotsByItem = new Map<number, { lotNumber: string; expiresOn: string | null; cases: number }[]>();
  for (const { lot } of lotRows) {
    lotsByItem.set(lot.orderItemId, [...(lotsByItem.get(lot.orderItemId) ?? []), lot]);
  }
  const owner =
    viewer !== null &&
    (order.userId === viewer.id || (viewer.emailVerified && viewer.email.toLowerCase() === order.email.toLowerCase()));
  const eligibility = returnEligibility(order);
  const returnable = owner && eligibility.eligible ? (await returnableLines(order.id)).filter((line) => line.returnable > 0) : [];
  const totalUnits = items.reduce((sum, item) => sum + item.cases * item.unitsPerCase, 0);

  const productIds = items.flatMap((item) => (item.productId ? [item.productId] : []));
  const catalog = productIds.length
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const byId = new Map(catalog.map((product) => [product.id, product]));

  const reorder: ReorderItem[] = [];
  const unavailable: string[] = [];
  for (const item of items) {
    const product = item.productId ? byId.get(item.productId) : undefined;
    if (!product || !product.active || product.stock < 1) {
      unavailable.push(item.sku);
      continue;
    }
    reorder.push({
      productId: product.id,
      minCases: product.minCases,
      cases: Math.min(item.cases, product.stock),
    });
  }

  const payment = PAYMENT[order.paymentStatus] ?? { badge: paymentLabel(order.paymentStatus), headline: paymentLabel(order.paymentStatus), tone: "wait" as const };
  const cancelled = order.status === "cancelled";
  const stepIndex = Math.max(0, STEPS.findIndex((step) => step.key === order.status));
  const dueDate = new Date(order.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const savings = order.accountDiscount + order.couponDiscount;
  const firstName = order.customerName.split(" ")[0];

  return (
    <div className="wrap py-8 lg:py-10">
      {/* Print-only invoice header ------------------------------------- */}
      <div className="mb-6 hidden border-b border-ink pb-4 print:block">
        <div className="flex items-start justify-between">
          <div>
            <p className="display text-[26px]">{SITE.name}</p>
            <p className="text-[11px]">{SITE.address}</p>
            <p className="text-[11px]">{SITE.email} · {SITE.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-wide">INVOICE</p>
            <p className="text-[11px]">No. {order.orderNumber}</p>
            <p className="text-[11px]">{formatDate(order.createdAt)}</p>
            {order.poNumber ? <p className="text-[11px] font-bold">PO {order.poNumber}</p> : null}
          </div>
        </div>
        <p className="mt-3 text-[11px]">
          <strong>Bill to:</strong> {order.customerName}
          {order.company ? ` · ${order.company}` : ""} · {order.email}
        </p>
      </div>

      {/* Banner ------------------------------------------------------- */}
      <section
        className={`rounded-2xl p-6 text-cream shadow-[0_24px_60px_-34px_rgba(20,36,28,0.7)] sm:p-8 print:hidden ${
          cancelled ? "bg-clay" : payment.tone === "ok" ? "bg-moss" : "bg-ink"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-cream/12 px-3.5 py-1.5 text-[11.5px] font-semibold text-cream">
              {cancelled ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {cancelled ? "Order cancelled" : payment.badge}
            </span>
            <h1 className="display mt-4 text-[32px] leading-tight text-cream sm:text-[40px]">
              Thank you, {firstName}.
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-cream/70">
              Order <strong className="font-bold text-cream">{order.orderNumber}</strong> was placed{" "}
              {formatDateTime(order.createdAt)} and is queued at our Paterson, NJ warehouse. A confirmation
              was sent to {order.email}.
            </p>
          </div>
          <OrderActions items={reorder} unavailable={unavailable} />
        </div>
      </section>

      {order.paymentStatus === "awaiting_payment" ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-gold/50 bg-gold/12 p-4 print:border-ink">
          <Landmark size={18} className="mt-0.5 shrink-0 text-[#7a5a1f]" />
          <div>
            <p className="text-[13px] font-bold">Awaiting your ACH / wire transfer of {formatMoney(order.total)}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink/65">
              Your cases are reserved. The trade desk emails remittance instructions — reference{" "}
              <strong>{order.orderNumber}</strong> on the transfer. The order ships once funds clear.
            </p>
          </div>
        </div>
      ) : null}
      {order.paymentStatus === "net30_invoice" ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-ink/15 bg-[#fffdf8] p-4">
          <Building2 size={18} className="mt-0.5 shrink-0 text-fern" />
          <div>
            <p className="text-[13px] font-bold">
              Invoice of {formatMoney(order.total)} due {formatDate(dueDate)}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink/65">
              Net-30 terms{order.poNumber ? ` · PO ${order.poNumber}` : ""}. Quote the order number when
              you remit payment.
            </p>
          </div>
        </div>
      ) : null}

      {/* Shipment + timeline ------------------------------------------- */}
      <section className="card mt-5 p-5 sm:p-6">
        <div className="grid gap-5 border-b border-ink/10 pb-5 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">Carrier &amp; service</p>
            <p className="mt-1 text-[14px] font-bold">{order.shippingCarrier}</p>
            <p className="text-[11.5px] text-ink/55">{order.shippingService}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">Payment</p>
            <p className="mt-1 text-[14px] font-bold">{payment.headline}</p>
            <p className="text-[11.5px] text-ink/55">
              {METHOD_LABEL[order.paymentMethod] ?? "Credit card"}
              {order.poNumber ? ` · PO ${order.poNumber}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">Tracking number</p>
            {order.trackingNumber ? (
              <div className="mt-1 flex items-center gap-1">
                <code className="rounded-md bg-ink/[0.06] px-2.5 py-1.5 font-mono text-[12.5px] font-bold">
                  {order.trackingNumber}
                </code>
                <CopyButton value={order.trackingNumber} label="Copy tracking number" />
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink/50">
                <Clock size={13} /> Added when the carrier scans the shipment
              </p>
            )}
            {order.trackingUrl ? (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="no-print mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-fern underline-offset-4 hover:underline"
              >
                Track shipment <ArrowRight size={11} />
              </a>
            ) : null}
          </div>
        </div>

        {cancelled ? (
          <p className="mt-5 flex items-center gap-2 text-[12.5px] font-semibold text-clay">
            <XCircle size={15} /> This order was cancelled. Contact the trade desk if this is unexpected.
          </p>
        ) : (
          <ol className="mt-6 grid grid-cols-4 gap-2">
            {STEPS.map((step, index) => {
              const complete = index < stepIndex || order.status === "delivered";
              const current = index === stepIndex && order.status !== "delivered";
              return (
                <li key={step.key} className="relative flex flex-col items-center text-center">
                  {index > 0 ? (
                    <span
                      className={`absolute right-1/2 top-[18px] -z-0 h-0.5 w-full ${
                        index <= stepIndex || order.status === "delivered" ? "bg-fern" : "bg-ink/12"
                      }`}
                    />
                  ) : null}
                  <span
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold ${
                      complete
                        ? "bg-fern text-cream"
                        : current
                          ? "bg-ink text-cream ring-4 ring-ink/10"
                          : "bg-ink/[0.07] text-ink/40"
                    }`}
                  >
                    {complete ? <Check size={15} /> : index + 1}
                  </span>
                  <span
                    className={`mt-2 text-[11px] font-semibold sm:text-[12px] ${
                      complete || current ? "text-ink" : "text-ink/40"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-5 py-3.5">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
                <Package size={13} /> Order manifest ({items.length})
              </p>
              <p className="text-[10.5px] text-ink/45">
                {items.reduce((sum, item) => sum + item.cases, 0)} cases · {totalUnits} units
              </p>
            </div>
            <ul className="divide-y divide-ink/8">
              {items.map((item) => {
                const product = item.productId ? byId.get(item.productId) : undefined;
                return (
                  <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-lg border border-ink/10 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      {product ? (
                        <p className="text-[10px] font-bold tracking-[0.14em] text-fern uppercase">{product.brand}</p>
                      ) : null}
                      <p className="text-[13.5px] font-semibold leading-snug">{item.name}</p>
                      <p className="mt-0.5 text-[10.5px] text-ink/45">
                        {item.sku} · {item.cases} case{item.cases === 1 ? "" : "s"} × {item.unitsPerCase} units ·{" "}
                        {formatMoney(item.unitPrice)} / unit
                      </p>
                      {lotsByItem.get(item.id)?.length ? (
                        <p className="mt-0.5 font-mono text-[10px] text-ink/50">
                          {lotsByItem
                            .get(item.id)!
                            .map((lot) => `Lot ${lot.lotNumber}${lot.expiresOn ? ` · best by ${formatIsoDate(lot.expiresOn)}` : ""} (${lot.cases})`)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {item.returnedCases > 0 ? (
                        <p className="mt-0.5 text-[10px] font-semibold text-clay">{item.returnedCases} case(s) returned</p>
                      ) : null}
                    </div>
                    <p className="text-[14px] font-bold tabular-nums">{formatMoney(item.lineTotal)}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          {returns.length || returnable.length || (owner && eligibility.deadline) ? (
            <section className="card p-5 print:hidden" id="returns">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Returns</p>
              {returns.length ? (
                <ul className="mt-3 space-y-2 text-[12px]">
                  {returns.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/8 pb-2 last:border-0">
                      <span>
                        <span className="font-mono font-bold">{entry.rmaNumber}</span> · {RETURN_STATUS[entry.status] ?? entry.status}
                        {entry.adminNote ? <span className="block text-[11px] text-ink/55">{entry.adminNote}</span> : null}
                      </span>
                      {entry.status === "refunded" ? (
                        <span className="font-semibold tabular-nums text-fern">
                          {formatMoney(entry.refundGoods + entry.refundTax + entry.refundShipping)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3">
                {returnable.length && eligibility.deadline ? (
                  <ReturnRequestForm
                    orderNumber={order.orderNumber}
                    deadline={formatDate(eligibility.deadline)}
                    lines={returnable.map((line) => ({ id: line.id, name: line.name, sku: line.sku, returnable: line.returnable }))}
                  />
                ) : owner && eligibility.reason ? (
                  <p className="text-[11.5px] text-ink/55">{eligibility.reason} Contact the trade desk for help.</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {history.length ? (
            <section className="card p-5 print:hidden">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Order history</p>
              <ol className="mt-3 space-y-2 border-l border-ink/12 pl-4 text-[12px]">
                {history.map((event) => (
                  <li key={event.id}>
                    <p className="font-semibold capitalize">
                      {event.type === "status" || event.type === "created" ? event.toValue : event.type === "return" ? `Return ${event.toValue ?? ""}` : event.type === "refund" ? "Refund" : event.type === "payment" ? paymentLabel(event.toValue ?? "") : event.type}
                    </p>
                    <p className="text-[10.5px] text-ink/50">
                      {formatDateTime(event.createdAt)}
                      {event.message ? ` · ${event.message}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="no-print rounded-xl bg-ink p-5 text-cream">
            <p className="text-[10px] font-bold tracking-[0.16em] text-gold uppercase">What happens next</p>
            <ol className="mt-3 grid gap-3 text-[11.5px] leading-relaxed text-cream/70 sm:grid-cols-3">
              <li>
                <strong className="block text-cream">1. Pick &amp; pack</strong>
                Cases are staged in Paterson within two business days.
              </li>
              <li>
                <strong className="block text-cream">2. Carrier scan</strong>
                Tracking appears here and in your account.
              </li>
              <li>
                <strong className="block text-cream">3. Delivery</strong>
                LTL deliveries are scheduled by phone using your freight contact.
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              {viewer ? (
                <Link href="/account" className="btn btn-light btn-sm">
                  Open trade portal
                </Link>
              ) : (
                <Link href="/signup" className="btn btn-light btn-sm">
                  Create an account to track orders
                </Link>
              )}
              <Link href="/shop" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
                Continue shopping
              </Link>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Financial breakdown</p>
            <dl className="mt-3 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-ink/55">Catalog subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(order.subtotal)}</dd>
              </div>
              {order.accountDiscount > 0 ? (
                <div className="flex justify-between text-fern">
                  <dt>Volume &amp; trade savings</dt>
                  <dd className="font-semibold tabular-nums">−{formatMoney(order.accountDiscount)}</dd>
                </div>
              ) : null}
              {order.couponDiscount > 0 ? (
                <div className="flex justify-between text-fern">
                  <dt>Coupon {order.couponCode}</dt>
                  <dd className="font-semibold tabular-nums">−{formatMoney(order.couponDiscount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink/55">Freight</dt>
                <dd className="font-semibold tabular-nums">
                  {order.shippingCost === 0 ? "Waived" : formatMoney(order.shippingCost)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/55">
                  Sales tax{" "}
                  {order.taxExempt
                    ? "(resale exempt)"
                    : `(${stateName(order.shippingAddress.state)} · ${formatRate(order.taxRate)})`}
                </dt>
                <dd className="font-semibold tabular-nums">{formatMoney(order.taxAmount)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-ink/10 pt-3">
                <dt className="text-[13px] font-bold">
                  {["paid", "paid_demo", "refunded", "partially_refunded", "refund_due"].includes(order.paymentStatus) ? "Total paid" : "Total due"}
                </dt>
                <dd className="display text-[26px] leading-none">{formatMoney(order.total)}</dd>
              </div>
              {order.refundedAmount > 0 ? (
                <div className="flex justify-between text-clay">
                  <dt>Refunded / credited</dt>
                  <dd className="font-semibold tabular-nums">−{formatMoney(order.refundedAmount)}</dd>
                </div>
              ) : null}
            </dl>
            {savings > 0 ? (
              <p className="mt-3 flex items-center gap-1.5 rounded-md bg-fern/10 px-2.5 py-2 text-[10.5px] font-semibold text-fern">
                <BadgeCheck size={12} /> You saved {formatMoney(savings)} on this order
              </p>
            ) : null}
          </section>

          <section className="card p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
              <MapPin size={13} /> Delivery destination
            </p>
            <p className="mt-3 text-[13px] font-bold">{order.customerName}</p>
            {order.company ? <p className="text-[12px] text-ink/60">{order.company}</p> : null}
            <p className="mt-1 text-[12px] leading-relaxed text-ink/65">
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              ) : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
              <br />
              {order.shippingAddress.country}
            </p>
            {order.phone ? <p className="mt-2 text-[11px] text-ink/50">Freight contact: {order.phone}</p> : null}
            {order.notes ? (
              <p className="mt-2 rounded-md bg-parchment/60 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink/60">
                {order.notes}
              </p>
            ) : null}
            <p className="mt-3 flex items-center gap-1.5 border-t border-ink/8 pt-3 text-[10.5px] text-ink/45">
              <Truck size={12} /> {order.shippingCarrier} · {order.shippingService}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
