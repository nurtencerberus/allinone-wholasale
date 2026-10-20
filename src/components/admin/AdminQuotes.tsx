"use client";

import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { QUOTE_VALID_DAYS, type QuoteView } from "@/lib/quotes-view";
import { formatMoney } from "@/lib/money";

type Draft = { prices: Record<number, string>; validDays: string; note: string };

const TONE: Record<string, string> = {
  requested: "bg-gold/20 text-ink",
  quoted: "bg-moss text-cream",
  accepted: "bg-fern/15 text-fern",
  declined: "bg-clay/10 text-clay",
  expired: "bg-ink/8 text-ink/65",
  withdrawn: "bg-ink/8 text-ink/65",
};

export function AdminQuotes({ quotes, canQuote }: { quotes: QuoteView[]; canQuote: boolean }) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftFor = (quote: QuoteView): Draft =>
    drafts[quote.id] ?? {
      prices: Object.fromEntries(
        quote.lines.map((line) => [line.id, ((line.casePrice ?? line.listCasePrice) / 100).toFixed(2)]),
      ),
      validDays: String(QUOTE_VALID_DAYS),
      note: quote.adminNote ?? "",
    };

  const send = async (quote: QuoteView, action: "send" | "decline") => {
    const draft = draftFor(quote);
    setBusy(quote.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          validDays: Number(draft.validDays),
          note: draft.note,
          prices: quote.lines.map((line) => ({
            quoteItemId: line.id,
            casePrice: Math.round(Number(draft.prices[line.id]) * 100),
          })),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not update the quote.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — nothing was sent.");
    } finally {
      setBusy(null);
    }
  };

  if (!quotes.length) {
    return <p className="card p-10 text-center text-[12.5px] text-ink/72">No quote requests yet.</p>;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}

      {quotes.map((quote) => {
        const draft = draftFor(quote);
        const open = quote.status === "requested" || quote.status === "quoted";
        const total = quote.lines.reduce((sum, line) => sum + Math.round(Number(draft.prices[line.id]) * 100) * line.cases, 0);
        const listTotal = quote.lines.reduce((sum, line) => sum + line.listCasePrice * line.cases, 0);
        return (
          <article key={quote.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-parchment/40 px-5 py-3">
              <div>
                <p className="text-[13px] font-bold">
                  {quote.reference} · {quote.account.company || quote.account.name}
                </p>
                <p className="text-[10.5px] text-ink/65">
                  {quote.account.email} · asked {new Date(quote.createdAt).toLocaleDateString()}
                  {quote.expiresAt ? ` · stands until ${new Date(quote.expiresAt).toLocaleDateString()}` : ""}
                </p>
                {quote.customerNote ? <p className="mt-1 text-[11px] text-ink/72">Buyer: {quote.customerNote}</p> : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.1em] uppercase ${TONE[quote.status] ?? ""}`}>
                {quote.status}
              </span>
            </header>

            <table className="w-full text-left text-[11.5px]">
              <thead className="border-b border-ink/8 text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">
                <tr>
                  <th scope="col" className="px-5 py-2">SKU</th>
                  <th scope="col" className="px-2 py-2 text-right">Cases</th>
                  <th scope="col" className="px-2 py-2 text-right">List</th>
                  <th scope="col" className="px-5 py-2 text-right">Quoted ($ / case)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {quote.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-5 py-2.5">
                      <p className="font-semibold">{line.name}</p>
                      <p className="text-[10.5px] text-ink/65">{line.sku}</p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{line.cases}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-ink/65">{formatMoney(line.listCasePrice)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {open && canQuote ? (
                        <input
                          aria-label={`Quoted case price for ${line.sku}`}
                          className="field w-28 text-right"
                          inputMode="decimal"
                          value={draft.prices[line.id] ?? ""}
                          onChange={(event) =>
                            setDrafts({
                              ...drafts,
                              [quote.id]: { ...draft, prices: { ...draft.prices, [line.id]: event.target.value } },
                            })
                          }
                        />
                      ) : (
                        <span className="font-bold tabular-nums">
                          {line.casePrice === null ? "—" : formatMoney(line.casePrice)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-ink/10 px-5 py-3">
              <div className="flex flex-wrap items-end gap-3">
                {open && canQuote ? (
                  <>
                    <label className="block">
                      <span className="label">Valid for (days)</span>
                      <input
                        aria-label="Days the quote stands"
                        className="field w-24"
                        inputMode="numeric"
                        value={draft.validDays}
                        onChange={(event) => setDrafts({ ...drafts, [quote.id]: { ...draft, validDays: event.target.value } })}
                      />
                    </label>
                    <label className="block">
                      <span className="label">Note to the buyer</span>
                      <input
                        aria-label="Note to the buyer"
                        className="field w-72"
                        value={draft.note}
                        onChange={(event) => setDrafts({ ...drafts, [quote.id]: { ...draft, note: event.target.value } })}
                        placeholder="Freight quoted separately at checkout"
                      />
                    </label>
                  </>
                ) : quote.adminNote ? (
                  <p className="text-[11px] text-ink/72">Desk: {quote.adminNote}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <p className="text-[11px] text-ink/72">
                  list {formatMoney(listTotal)} ·{" "}
                  <span className="font-bold text-ink">quoted {formatMoney(total)}</span>
                </p>
                {open && canQuote ? (
                  <>
                    <button
                      type="button"
                      disabled={busy === quote.id}
                      onClick={() => void send(quote, "decline")}
                      className="btn btn-outline btn-sm"
                    >
                      <X size={13} /> Decline
                    </button>
                    <button
                      type="button"
                      disabled={busy === quote.id}
                      onClick={() => void send(quote, "send")}
                      className="btn btn-primary btn-sm"
                    >
                      <Send size={13} /> {quote.status === "quoted" ? "Re-send quote" : "Send quote"}
                    </button>
                  </>
                ) : quote.status === "accepted" ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fern">
                    <Check size={13} /> On the account price list
                  </span>
                ) : null}
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
