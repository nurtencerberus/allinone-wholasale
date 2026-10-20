import Link from "next/link";
import { ArrowRight, ExternalLink, Truck } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/money";
import { paymentLabel } from "@/lib/order-admin";

export type AdminOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  company: string | null;
  email: string;
  status: string;
  total: number;
  shippingCarrier: string;
  shippingService: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  taxExempt: boolean;
  isWholesale: boolean;
  paymentStatus: string;
  paymentMethod: string;
  poNumber: string | null;
};

const PAYMENT_TONE: Record<string, string> = {
  paid: "bg-fern/15 text-fern",
  paid_demo: "bg-ink/10 text-ink/70",
  net30_invoice: "bg-gold/25 text-[#7a5a1f]",
  awaiting_payment: "bg-clay/15 text-clay",
  refund_pending: "bg-clay/15 text-clay",
  refund_due: "bg-clay/15 text-clay",
};

const STATUS_TONE: Record<string, string> = {
  processing: "bg-gold/15 text-[#7a5a1f]",
  picking: "bg-sky-100 text-sky-800",
  shipped: "bg-fern/15 text-fern",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-clay/15 text-clay",
};

/** Order list. Status, tracking, cancellation and refunds are handled on each order's page. */
export function AdminOrders({ orders }: { orders: AdminOrder[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
          <Truck size={13} /> Orders
        </p>
        <span className="text-[10.5px] text-ink/65">{orders.length} orders</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[11px]">
          <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/65 uppercase">
            <tr className="border-b border-ink/8">
              <th scope="col" className="px-4 py-2.5">Order / buyer</th>
              <th scope="col" className="px-2 py-2.5">Placed</th>
              <th scope="col" className="px-2 py-2.5 text-right">Total</th>
              <th scope="col" className="px-2 py-2.5">Status</th>
              <th scope="col" className="px-2 py-2.5">Payment</th>
              <th scope="col" className="px-2 py-2.5">Tracking</th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-ink/5 align-top last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${order.orderNumber}`} className="font-bold hover:underline">
                    {order.orderNumber}
                  </Link>
                  <p className="text-[10px] text-ink/68">
                    {order.customerName}
                    {order.company ? ` · ${order.company}` : ""}
                  </p>
                  <p className="text-[9.5px] text-ink/50">
                    {order.paymentMethod.toUpperCase()}
                    {order.poNumber ? ` · PO ${order.poNumber}` : ""}
                    {order.taxExempt ? " · tax exempt" : ""}
                  </p>
                </td>
                <td className="px-2 py-3 text-ink/70">{formatDate(order.createdAt)}</td>
                <td className="px-2 py-3 text-right font-bold tabular-nums">{formatMoney(order.total)}</td>
                <td className="px-2 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_TONE[order.status] ?? ""}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${PAYMENT_TONE[order.paymentStatus] ?? "bg-ink/8 text-ink/72"}`}>
                    {paymentLabel(order.paymentStatus)}
                  </span>
                </td>
                <td className="px-2 py-3">
                  {order.trackingNumber ? (
                    <span className="font-mono text-[10px]">
                      {order.shippingCarrier} {order.trackingNumber}
                      {order.trackingUrl ? (
                        <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-fern">
                          <ExternalLink size={10} />
                        </a>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-ink/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/orders/${order.orderNumber}`} className="btn btn-outline btn-sm whitespace-nowrap">
                    Manage <ArrowRight size={11} />
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[11.5px] text-ink/65">
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
