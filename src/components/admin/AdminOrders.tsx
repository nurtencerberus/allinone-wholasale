"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ExternalLink, Loader2, Truck } from "lucide-react";
import { ORDER_STATUSES } from "@/lib/site";
import { formatDate, formatMoney } from "@/lib/money";

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

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-fern/15 text-fern" },
  paid_demo: { label: "Demo paid", className: "bg-ink/10 text-ink/55" },
  net30_invoice: { label: "Net-30 · unpaid", className: "bg-gold/25 text-[#7a5a1f]" },
  awaiting_payment: { label: "Awaiting ACH/wire", className: "bg-clay/15 text-clay" },
};

export function AdminOrders({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, { status: string; carrier: string; tracking: string }>>(
    Object.fromEntries(
      orders.map((order) => [
        order.id,
        { status: order.status, carrier: order.shippingCarrier, tracking: order.trackingNumber ?? "" },
      ]),
    ),
  );
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markPaid = async (order: AdminOrder) => {
    if (!window.confirm(`Mark ${order.orderNumber} as paid? Only do this once the funds have arrived.`)) return;
    setSavingId(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markPaid: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not mark the order paid.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not mark the order paid.");
    } finally {
      setSavingId(null);
    }
  };

  const save = async (order: AdminOrder) => {
    const draft = drafts[order.id];
    setSavingId(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.status,
          carrier: draft.carrier,
          trackingNumber: draft.tracking,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the order.");
      setSavedId(order.id);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the order.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
          <Truck size={13} /> Order management & tracking
        </p>
        <span className="text-[10.5px] text-ink/45">{orders.length} orders</span>
      </div>

      {error ? (
        <p className="border-b border-clay/20 bg-clay/10 px-4 py-2 text-[11px] text-clay">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[11px]">
          <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
            <tr className="border-b border-ink/8">
              <th className="px-4 py-2.5">Order / buyer</th>
              <th className="px-2 py-2.5">Placed</th>
              <th className="px-2 py-2.5">Total</th>
              <th className="px-2 py-2.5">Status</th>
              <th className="px-2 py-2.5">Carrier</th>
              <th className="px-2 py-2.5">Tracking number</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const draft = drafts[order.id] ?? { status: order.status, carrier: order.shippingCarrier, tracking: "" };
              return (
                <tr key={order.id} className="border-b border-ink/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/order/${order.orderNumber}`} className="font-bold hover:underline">
                      {order.orderNumber}
                    </Link>
                    <p className="text-[10px] text-ink/50">
                      {order.customerName}
                      {order.company ? ` · ${order.company}` : ""}
                    </p>
                    <p className="text-[9.5px] text-ink/35">
                      {order.isWholesale ? "Wholesale" : "Catalog"}
                      {order.taxExempt ? " · tax exempt" : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase ${
                          (PAYMENT_BADGE[order.paymentStatus] ?? PAYMENT_BADGE.paid).className
                        }`}
                      >
                        {(PAYMENT_BADGE[order.paymentStatus] ?? PAYMENT_BADGE.paid).label}
                      </span>
                      {order.poNumber ? (
                        <span className="font-mono text-[9px] font-bold text-ink/50">PO {order.poNumber}</span>
                      ) : null}
                    </p>
                  </td>
                  <td className="px-2 py-3 text-ink/55">{formatDate(order.createdAt)}</td>
                  <td className="px-2 py-3 font-bold tabular-nums">{formatMoney(order.total)}</td>
                  <td className="px-2 py-3">
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [order.id]: { ...draft, status: event.target.value } })
                      }
                      className="rounded border border-ink/20 bg-white px-1.5 py-1 text-[10.5px] capitalize"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <select
                      value={draft.carrier}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [order.id]: { ...draft, carrier: event.target.value } })
                      }
                      className="w-[110px] rounded border border-ink/20 bg-white px-1.5 py-1 text-[10.5px]"
                    >
                      {["UPS", "FedEx", "USPS", "Meridian Freight"].map((carrier) => (
                        <option key={carrier} value={carrier}>{carrier}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <input
                      value={draft.tracking}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [order.id]: { ...draft, tracking: event.target.value } })
                      }
                      placeholder="1Z999AA10123456784"
                      className="w-[160px] rounded border border-ink/20 bg-white px-2 py-1 text-[10.5px]"
                    />
                    {order.trackingUrl ? (
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex items-center gap-1 text-[9.5px] text-fern hover:underline"
                      >
                        Live tracking <ExternalLink size={9} />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => save(order)}
                      disabled={savingId === order.id}
                      className="btn btn-primary btn-sm whitespace-nowrap"
                    >
                      {savingId === order.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : savedId === order.id ? (
                        <Check size={12} />
                      ) : null}
                      Save
                    </button>
                    {order.paymentStatus === "awaiting_payment" || order.paymentStatus === "net30_invoice" ? (
                      <button
                        onClick={() => markPaid(order)}
                        disabled={savingId === order.id}
                        className="btn btn-outline btn-sm mt-1.5 w-full whitespace-nowrap"
                      >
                        Mark paid
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[11.5px] text-ink/45">
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink/10 bg-parchment/30 px-4 py-2.5 text-[10px] text-ink/45">
        Saving with a new tracking number emails the buyer automatically and generates the carrier tracking
        link (UPS, FedEx, USPS).
      </p>
    </div>
  );
}
