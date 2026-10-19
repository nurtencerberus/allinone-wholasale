"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";

export type ReturnableLine = { id: number; name: string; sku: string; returnable: number };

const REASONS: [string, string][] = [
  ["damaged", "Arrived damaged"],
  ["wrong_item", "Wrong item shipped"],
  ["not_as_described", "Not as described"],
  ["expired_or_short_dated", "Expired or short-dated"],
  ["no_longer_needed", "No longer needed"],
  ["other", "Other"],
];

export function ReturnRequestForm({ orderNumber, lines, deadline }: { orderNumber: string; lines: ReturnableLine[]; deadline: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <p className="rounded-lg border border-fern/30 bg-fern/8 px-4 py-3 text-[12px] font-semibold text-fern">
        Return {done} requested. We reply within one business day with shipping instructions.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        <Undo2 size={13} /> Request a return
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderNumber}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Object.entries(cases)
            .filter(([, value]) => value > 0)
            .map(([orderItemId, value]) => ({ orderItemId: Number(orderItemId), cases: value })),
          reason,
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit the return.");
      setDone(data.rmaNumber);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the return.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-ink/12 bg-[#fffdf8] p-4">
      <p className="text-[12px] text-ink/60">Returns are accepted until {deadline}, including opened supplements and food.</p>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-3 text-[12px]">
            <span>
              <span className="font-semibold">{line.name}</span> <span className="text-ink/45">{line.sku}</span>
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-ink/55">
              Cases
              <input
                type="number"
                min={0}
                max={line.returnable}
                value={cases[line.id] ?? 0}
                onChange={(event) => setCases({ ...cases, [line.id]: Math.min(line.returnable, Math.max(0, Number(event.target.value))) })}
                className="w-16 rounded border border-ink/20 bg-white px-1.5 py-1 text-[12px]"
              />
              <span>of {line.returnable}</span>
            </label>
          </li>
        ))}
      </ul>
      <select required className="field" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Return reason">
        <option value="">Reason…</option>
        {REASONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <textarea className="field min-h-[60px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Details (lot number, photos sent by email, etc.)" />
      {error ? <p className="text-[11.5px] font-medium text-clay">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
          {busy ? <Loader2 size={13} className="animate-spin" /> : null} Submit return request
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
