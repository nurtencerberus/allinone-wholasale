"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/money";

export type AdminReturn = {
  id: number;
  rmaNumber: string;
  status: string;
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  createdAt: string;
  orderNumber: string;
  buyer: string;
  refunded: number;
  refundRef: string | null;
  preview: { without: number; withShipping: number; tax: number } | null;
  items: {
    id: number;
    name: string;
    sku: string;
    cases: number;
    condition: string | null;
    disposition: string | null;
    perishable: boolean;
  }[];
};

const STATUS_TONE: Record<string, string> = {
  requested: "bg-gold/20 text-[#7a5a1f]",
  approved: "bg-sky-100 text-sky-800",
  received: "bg-fern/15 text-fern",
  refunded: "bg-emerald-100 text-emerald-800",
  rejected: "bg-clay/15 text-clay",
};

function ReturnCard({ entry, canHandle, canRefund }: { entry: AdminReturn; canHandle: boolean; canRefund: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [shipping, setShipping] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, { condition: string; disposition: string }>>(
    Object.fromEntries(entry.items.map((item) => [item.id, { condition: "sealed", disposition: item.perishable ? "quarantine" : "restock" }])),
  );

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/returns/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Update failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article id={`rma-${entry.id}`} className="card scroll-mt-28 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[13px] font-bold">{entry.rmaNumber}</p>
          <p className="text-[11px] text-ink/70">
            <Link href={`/admin/orders/${entry.orderNumber}`} className="font-semibold hover:underline">{entry.orderNumber}</Link> ·{" "}
            {entry.buyer} · {formatDate(entry.createdAt)} · {entry.reason.replace(/_/g, " ")}
          </p>
          {entry.customerNote ? <p className="mt-1 text-[11.5px] italic text-ink/65">“{entry.customerNote}”</p> : null}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase ${STATUS_TONE[entry.status] ?? ""}`}>{entry.status}</span>
      </div>

      <table className="mt-3 w-full text-left text-[11.5px]">
        <tbody>
          {entry.items.map((item) => (
            <tr key={item.id} className="border-t border-ink/8 align-top">
              <td className="py-2">
                <span className="font-mono font-semibold">{item.sku}</span> {item.name}
              </td>
              <td className="py-2 text-right tabular-nums">{item.cases} case(s)</td>
              <td className="py-2 pl-3">
                {entry.status === "approved" && canHandle ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <select
                      aria-label="Condition"
                      className="rounded border border-ink/20 bg-white px-1.5 py-1 text-[11px]"
                      value={decisions[item.id].condition}
                      onChange={(event) => {
                        const condition = event.target.value;
                        setDecisions({
                          ...decisions,
                          [item.id]: { condition, disposition: condition === "sealed" && !item.perishable ? "restock" : condition === "damaged" ? "destroy" : "quarantine" },
                        });
                      }}
                    >
                      <option value="sealed">Sealed</option>
                      <option value="opened">Opened</option>
                      <option value="damaged">Damaged</option>
                    </select>
                    <select
                      aria-label="Disposition"
                      className="rounded border border-ink/20 bg-white px-1.5 py-1 text-[11px]"
                      value={decisions[item.id].disposition}
                      onChange={(event) => setDecisions({ ...decisions, [item.id]: { ...decisions[item.id], disposition: event.target.value } })}
                    >
                      <option value="restock" disabled={decisions[item.id].condition !== "sealed" || item.perishable}>Back on sale</option>
                      <option value="quarantine">Quarantine</option>
                      <option value="destroy">Destroy</option>
                    </select>
                  </div>
                ) : item.condition ? (
                  <span className="text-[11px] text-ink/72">{item.condition} → {item.disposition}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error ? <p role="alert" className="mt-2 text-[11.5px] font-medium text-clay">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {entry.status === "requested" && canHandle ? (
          <>
            <input aria-label="Note for the buyer" className="field max-w-[320px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note to the buyer (required to reject)" />
            <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={() => act({ action: "approve", note })}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : null} Approve
            </button>
            <button type="button" disabled={busy} className="btn btn-outline btn-sm" onClick={() => act({ action: "reject", note })}>Reject</button>
          </>
        ) : null}
        {entry.status === "approved" && canHandle ? (
          <button
            type="button"
            disabled={busy}
            className="btn btn-primary btn-sm"
            onClick={() => act({ action: "receive", items: entry.items.map((item) => ({ returnItemId: item.id, ...decisions[item.id] })) })}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} Cartons received
          </button>
        ) : null}
        {entry.status === "received" && entry.preview ? (
          canRefund ? (
            <>
              <label className="flex items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={shipping} onChange={(event) => setShipping(event.target.checked)} className="accent-[#14241c]" />
                Refund original freight (our error)
              </label>
              <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={() => act({ action: "refund", includeShipping: shipping })}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} Refund {formatMoney(shipping ? entry.preview.withShipping : entry.preview.without)}
              </button>
              <span className="text-[10.5px] text-ink/65">incl. {formatMoney(entry.preview.tax)} sales tax</span>
            </>
          ) : (
            <span className="text-[11px] text-ink/70">Awaiting refund by accounting.</span>
          )
        ) : null}
        {entry.status === "refunded" ? (
          <span className="text-[11.5px] font-semibold text-fern">
            {formatMoney(entry.refunded)} refunded{entry.refundRef ? ` · ${entry.refundRef}` : ""}
          </span>
        ) : null}
        {entry.adminNote && entry.status !== "requested" ? <span className="text-[11px] text-ink/70">Note: {entry.adminNote}</span> : null}
      </div>
    </article>
  );
}

export function AdminReturns({ returns, canHandle, canRefund }: { returns: AdminReturn[]; canHandle: boolean; canRefund: boolean }) {
  if (!returns.length) {
    return <p className="rounded-xl border border-dashed border-ink/20 py-14 text-center text-[12px] text-ink/65">No return requests yet.</p>;
  }
  return (
    <div className="space-y-3">
      {returns.map((entry) => (
        <ReturnCard key={entry.id} entry={entry} canHandle={canHandle} canRefund={canRefund} />
      ))}
    </div>
  );
}
