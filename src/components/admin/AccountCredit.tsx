"use client";

import { useState } from "react";
import { CreditCard, Save } from "lucide-react";
import { formatMoney } from "@/lib/money";

export function AccountCredit({
  accountId,
  creditLimit,
  paymentTermsDays,
  creditHold,
  openBalance,
  overdue,
  scope,
  canEdit,
}: {
  accountId: number;
  creditLimit: number;
  paymentTermsDays: number;
  creditHold: boolean;
  openBalance: number;
  overdue: number;
  scope: "account" | "company";
  canEdit: boolean;
}) {
  const [limit, setLimit] = useState((creditLimit / 100).toFixed(2));
  const [days, setDays] = useState(String(paymentTermsDays));
  const [hold, setHold] = useState(creditHold);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/accounts/${accountId}/credit`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creditLimit: Number(limit), paymentTermsDays: Number(days), creditHold: hold }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save the terms.");
        return;
      }
      setNotice(data.message ?? "Saved.");
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setBusy(false);
    }
  };

  const available = Math.max(0, Math.round(Number(limit) * 100) - openBalance);

  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
        <CreditCard size={13} /> Invoice terms {scope === "company" ? "· whole company account" : ""}
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-clay/40 bg-clay/10 px-3 py-2 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-[12px] font-semibold text-fern">{notice}</p> : null}

      <div className="mt-3 grid gap-3 text-[11.5px] sm:grid-cols-3">
        <div className="rounded-md bg-parchment/50 px-3 py-2">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">On invoice now</p>
          <p className="mt-0.5 text-[15px] font-bold tabular-nums">{formatMoney(openBalance)}</p>
        </div>
        <div className="rounded-md bg-parchment/50 px-3 py-2">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">Past due</p>
          <p className={`mt-0.5 text-[15px] font-bold tabular-nums ${overdue > 0 ? "text-clay" : ""}`}>{formatMoney(overdue)}</p>
        </div>
        <div className="rounded-md bg-parchment/50 px-3 py-2">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">Still available</p>
          <p className="mt-0.5 text-[15px] font-bold tabular-nums">{formatMoney(available)}</p>
        </div>
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Credit limit ($)</span>
            <input aria-label="Credit limit in dollars" className="field w-36" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">Payment terms (days)</span>
            <input aria-label="Payment terms in days" className="field w-28" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[11.5px] font-medium">
            <input type="checkbox" checked={hold} onChange={(event) => setHold(event.target.checked)} />
            Credit hold
          </label>
          <button type="button" disabled={busy} onClick={() => void save()} className="btn btn-primary btn-sm">
            <Save size={14} /> {busy ? "Saving…" : "Save terms"}
          </button>
        </div>
      ) : null}

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink/65">
        A Net-30 order is refused when the account is on hold, has anything past due, or the order would take the
        balance over the limit. A limit of $0 means no invoice terms at all.
      </p>
    </div>
  );
}
