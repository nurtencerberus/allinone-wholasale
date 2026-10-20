import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { orderEvents, orderItemLots, orderItems, orders, returnRequests } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { allowedTransitions, paymentLabel } from "@/lib/order-admin";
import { formatDateTime, formatIsoDate, formatMoney, formatRate } from "@/lib/money";
import { SITE } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";
import { PrintButton } from "@/components/admin/PrintButton";

export const metadata = {
  title: "Admin · order",
  robots: { index: false, follow: false },
};

export default async function AdminOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const staff = await requireStaffPage("view", `/admin/orders/${number}`);
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, number)).limit(1);
  if (!order) notFound();

  const [items, lots, events, returns] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id)),
    db
      .select({ lot: orderItemLots })
      .from(orderItemLots)
      .innerJoin(orderItems, eq(orderItems.id, orderItemLots.orderItemId))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItemLots.id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(desc(orderEvents.createdAt), desc(orderEvents.id)),
    db.select().from(returnRequests).where(eq(returnRequests.orderId, order.id)).orderBy(desc(returnRequests.createdAt)),
  ]);
  const lotsByItem = new Map<number, (typeof lots)[number]["lot"][]>();
  for (const { lot } of lots) lotsByItem.set(lot.orderItemId, [...(lotsByItem.get(lot.orderItemId) ?? []), lot]);
  const address = order.shippingAddress;

  return (
    <div>
      <section className="bg-ink text-cream print:hidden">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
              <ArrowLeft size={12} /> Orders
            </Link>
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">{order.orderNumber}</h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              {order.company ?? order.customerName} · {formatDateTime(order.createdAt)} · {order.status} · {paymentLabel(order.paymentStatus)}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton label="Print packing slip" />
            <Link href={`/order/${order.orderNumber}`} className="btn btn-light btn-sm">Buyer view</Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap grid gap-6 py-8 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-5">
          {/* Packing slip: what prints */}
          <section className="card p-5 print:border-0 print:shadow-none">
            <div className="hidden print:block">
              <p className="display text-[22px]">{SITE.name} — Packing slip</p>
              <p className="text-[11px]">{SITE.address}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/65 uppercase">Ship to</p>
                <p className="mt-1 text-[13px] font-bold">{order.customerName}</p>
                {order.company ? <p className="text-[12px]">{order.company}</p> : null}
                <p className="text-[12px] text-ink/70">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {address.city}, {address.state} {address.zip}
                </p>
                {order.phone ? <p className="text-[11px] text-ink/70">{order.phone}</p> : null}
              </div>
              <div className="sm:text-right">
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/65 uppercase">Order</p>
                <p className="mt-1 font-mono text-[13px] font-bold">{order.orderNumber}</p>
                {order.poNumber ? <p className="text-[12px] font-semibold">PO {order.poNumber}</p> : null}
                <p className="text-[11.5px] text-ink/72">{order.shippingCarrier} · {order.shippingService}</p>
                {order.trackingNumber ? <p className="font-mono text-[11.5px]">{order.trackingNumber}</p> : null}
              </div>
            </div>
            <table className="mt-5 w-full text-left text-[11.5px]">
              <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/65 uppercase">
                <tr className="border-b border-ink/10">
                  <th scope="col" className="py-2">SKU / item</th>
                  <th scope="col">Lot · best by</th>
                  <th scope="col" className="text-right">Cases</th>
                  <th scope="col" className="text-right print:hidden">Net</th>
                  <th scope="col" className="text-right print:hidden">Tax</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-ink/6 align-top">
                    <td className="py-2">
                      <p className="font-mono font-bold">{item.sku}</p>
                      <p className="text-[10.5px] text-ink/72">{item.name} · {item.unitsPerCase}/case</p>
                      {item.returnedCases ? <p className="text-[10px] font-semibold text-clay">{item.returnedCases} returned</p> : null}
                    </td>
                    <td className="py-2 font-mono text-[10.5px]">
                      {(lotsByItem.get(item.id) ?? []).map((lot) => (
                        <p key={lot.id}>
                          {lot.lotNumber} · {formatIsoDate(lot.expiresOn)} × {lot.cases}
                        </p>
                      ))}
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums">{item.cases}</td>
                    <td className="py-2 text-right tabular-nums print:hidden">{formatMoney(item.lineTotal - item.discount)}</td>
                    <td className="py-2 text-right tabular-nums print:hidden">{formatMoney(item.taxAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.notes ? <p className="mt-3 text-[11.5px]"><strong>Buyer note:</strong> {order.notes}</p> : null}
          </section>

          <section className="card p-5 print:hidden">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Money</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-3">
              {[
                ["Catalog subtotal", formatMoney(order.subtotal)],
                ["Account discount", `−${formatMoney(order.accountDiscount)}`],
                [`Coupon ${order.couponCode ?? ""}`, `−${formatMoney(order.couponDiscount)}`],
                ["Freight", formatMoney(order.shippingCost)],
                [`Tax ${order.taxSource ?? ""} ${formatRate(order.taxRate)}`, formatMoney(order.taxAmount)],
                ["Taxable base", formatMoney(order.taxableAmount)],
                ["Freight tax", formatMoney(order.shippingTax)],
                ["Total", formatMoney(order.total)],
                ["Refunded / credited", formatMoney(order.refundedAmount)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-ink/6 pb-1">
                  <dt className="text-ink/70">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {order.exemptionCert ? <p className="mt-2 text-[11px] text-ink/70">Exemption certificate: {order.exemptionCert}</p> : null}
            <p className="mt-1 text-[11px] text-ink/70">
              {order.paymentMethod.toUpperCase()} · {paymentLabel(order.paymentStatus)}
              {order.paymentRef ? ` · ${order.paymentRef}` : ""}
            </p>
          </section>

          {returns.length ? (
            <section className="card p-5 print:hidden">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Returns</p>
              <ul className="mt-2 space-y-1 text-[12px]">
                {returns.map((entry) => (
                  <li key={entry.id}>
                    <Link href={`/admin/returns#rma-${entry.id}`} className="font-mono font-bold hover:underline">{entry.rmaNumber}</Link> · {entry.status} · {entry.reason.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card p-5 print:hidden">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">History</p>
            <ol className="mt-3 space-y-2 border-l border-ink/12 pl-4 text-[12px]">
              {events.map((event) => (
                <li key={event.id}>
                  <p className="font-semibold">
                    {event.type}
                    {event.fromValue || event.toValue ? `: ${event.fromValue ?? "—"} → ${event.toValue ?? "—"}` : ""}
                    {event.visibleToCustomer ? "" : " · internal"}
                  </p>
                  <p className="text-[10.5px] text-ink/68">
                    {formatDateTime(event.createdAt)} · {event.actorLabel}
                    {event.message ? ` · ${event.message}` : ""}
                  </p>
                </li>
              ))}
            </ol>
            {order.adminNotes ? <pre className="mt-3 whitespace-pre-wrap rounded bg-parchment/50 p-3 text-[11px]">{order.adminNotes}</pre> : null}
          </section>
        </div>

        <aside className="print:hidden">
          <AdminOrderActions
            orderId={order.id}
            status={order.status}
            paymentStatus={order.paymentStatus}
            carrier={order.shippingCarrier}
            trackingNumber={order.trackingNumber ?? ""}
            transitions={[...allowedTransitions(order.status)].filter((entry) => entry !== "cancelled")}
            canFulfil={hasPermission(staff, "orders")}
            canPay={hasPermission(staff, "payments")}
          />
        </aside>
      </div>
    </div>
  );
}
