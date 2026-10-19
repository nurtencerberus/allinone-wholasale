"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Loader2, RotateCcw } from "lucide-react";

const CARRIERS = ["UPS", "FedEx", "USPS", "Ciputra Freight", "LTL carrier"];

export function AdminOrderActions({
  orderId,
  status,
  paymentStatus,
  carrier: initialCarrier,
  trackingNumber: initialTracking,
  transitions,
  canFulfil,
  canPay,
}: {
  orderId: number;
  status: string;
  paymentStatus: string;
  carrier: string;
  trackingNumber: string;
  transitions: string[];
  canFulfil: boolean;
  canPay: boolean;
}) {
  const router = useRouter();
  const [carrier, setCarrier] = useState(initialCarrier);
  const [tracking, setTracking] = useState(initialTracking);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Update failed.");
      setMessage(data.message ?? "Saved.");
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancellable = status === "processing" || status === "picking";

  return (
    <div className="space-y-4 lg:sticky lg:top-28">
      {message ? <p className="rounded-md border border-fern/30 bg-fern/10 px-3 py-2 text-[11.5px] font-medium text-fern">{message}</p> : null}
      {error ? <p className="rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] font-medium text-clay">{error}</p> : null}

      {canFulfil && (transitions.length || status === "picking" || status === "shipped") ? (
        <div className="card space-y-3 p-4">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Fulfilment</p>
          {status === "picking" || status === "shipped" || transitions.includes("shipped") ? (
            <div className="grid gap-2">
              <select className="field" value={carrier} onChange={(event) => setCarrier(event.target.value)} aria-label="Carrier">
                {[...new Set([carrier, ...CARRIERS])].map((entry) => (
                  <option key={entry} value={entry}>{entry}</option>
                ))}
              </select>
              <input className="field font-mono" value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking / PRO number" aria-label="Tracking number" />
              {status === "shipped" ? (
                <button type="button" disabled={busy} className="btn btn-outline btn-sm" onClick={() => act({ action: "tracking", carrier, trackingNumber: tracking })}>
                  Update tracking
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {transitions.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                className={next === "shipped" || next === "delivered" || next === "picking" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                onClick={() => act({ action: "status", status: next, carrier, trackingNumber: tracking })}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                {next === "processing" ? "Back to processing" : `Mark ${next}`}
              </button>
            ))}
          </div>
          {transitions.includes("shipped") && !["paid", "paid_demo", "net30_invoice"].includes(paymentStatus) ? (
            <p className="text-[10.5px] text-clay">Payment is not settled — the order cannot ship yet.</p>
          ) : null}
        </div>
      ) : null}

      {canPay ? (
        <div className="card space-y-2 p-4">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Payment</p>
          {paymentStatus === "awaiting_payment" || paymentStatus === "net30_invoice" ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary btn-sm w-full"
              onClick={() => {
                const reference = window.prompt("Funds received. Bank / remittance reference:");
                if (reference !== null) void act({ action: "markPaid", reference });
              }}
            >
              Record payment received
            </button>
          ) : null}
          {paymentStatus === "refund_pending" ? (
            <button type="button" disabled={busy} className="btn btn-primary btn-sm w-full" onClick={() => act({ action: "retryRefund" })}>
              <RotateCcw size={12} /> Retry refund
            </button>
          ) : null}
          {paymentStatus === "refund_due" ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary btn-sm w-full"
              onClick={() => {
                const reference = window.prompt("Bank refund sent. Transfer reference:");
                if (reference) void act({ action: "bankRefund", reference });
              }}
            >
              Record bank refund sent
            </button>
          ) : null}
          {cancellable ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-sm w-full border border-clay/40 text-clay hover:bg-clay/10"
              onClick={() => {
                const reason = window.prompt("Cancel this order? Stock goes back to its lots and the payment is refunded or voided.\n\nReason (shown to the buyer):");
                if (reason) void act({ action: "cancel", reason });
              }}
            >
              <Ban size={12} /> Cancel order &amp; refund
            </button>
          ) : null}
        </div>
      ) : null}

      {canFulfil ? (
        <form
          className="card space-y-2 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await act({ action: "note", note })) setNote("");
          }}
        >
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Internal note</p>
          <textarea className="field min-h-[70px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Not visible to the buyer" />
          <button type="submit" disabled={busy || !note.trim()} className="btn btn-outline btn-sm">Add note</button>
        </form>
      ) : null}
    </div>
  );
}
