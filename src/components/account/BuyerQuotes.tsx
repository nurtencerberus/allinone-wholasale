"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import type { QuoteView } from "@/lib/quotes-view";
import { formatMoney } from "@/lib/money";

const TONE: Record<string, string> = {
  requested: "bg-parchment text-ink/72",
  quoted: "bg-moss text-cream",
  accepted: "bg-fern/15 text-fern",
  declined: "bg-clay/10 text-clay",
  expired: "bg-ink/8 text-ink/65",
  withdrawn: "bg-ink/8 text-ink/65",
};

const EXPLAIN: Record<string, string> = {
  requested: "With the trade desk.",
  quoted: "Priced and waiting for you.",
  accepted: "Applied to your orders until it expires.",
  declined: "The desk could not price this one.",
  expired: "The deadline passed — ask again.",
  withdrawn: "You withdrew this request.",
};

export function BuyerQuotes({ quotes }: { quotes: QuoteView[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: number, action: "accept" | "withdraw") => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not update the quote.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setBusy(null);
    }
  };

  if (!quotes.length) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="display text-2xl">No quotes yet</p>
        <p className="max-w-md text-[12.5px] leading-relaxed text-ink/72">
          Build a cart with the quantities you want priced, then choose <strong>Ask for a quote</strong> in the cart.
          The desk comes back with a price per case that applies to your orders once you accept it.
        </p>
        <Link href="/shop" className="btn btn-primary btn-sm mt-1">
          Browse the catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}

      {quotes.map((quote) => {
        const total = quote.lines.reduce((sum, line) => sum + (line.casePrice ?? 0) * line.cases, 0);
        const priced = quote.lines.every((line) => line.casePrice !== null);
        return (
          <article key={quote.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-parchment/40 px-5 py-3">
              <div>
                <p className="text-[13px] font-bold">{quote.reference}</p>
                <p className="text-[10.5px] text-ink/65">
                  Asked {new Date(quote.createdAt).toLocaleDateString()}
                  {quote.expiresAt ? ` · stands until ${new Date(quote.expiresAt).toLocaleDateString()}` : ""}
                </p>
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
                  <th scope="col" className="px-5 py-2 text-right">Quoted</th>
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
                    <td className="px-5 py-2.5 text-right font-bold tabular-nums">
                      {line.casePrice === null ? "—" : formatMoney(line.casePrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-5 py-3">
              <div>
                <p className="text-[11px] text-ink/72">{EXPLAIN[quote.status] ?? ""}</p>
                {quote.adminNote ? <p className="mt-1 text-[11px] text-ink/72">Desk: {quote.adminNote}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                {priced ? (
                  <p className="text-[12px] font-bold tabular-nums">{formatMoney(total)} total</p>
                ) : null}
                {quote.status === "quoted" ? (
                  <button
                    type="button"
                    disabled={busy === quote.id}
                    onClick={() => void act(quote.id, "accept")}
                    className="btn btn-primary btn-sm"
                  >
                    <Check size={13} /> Accept these prices
                  </button>
                ) : null}
                {quote.status === "requested" || quote.status === "quoted" ? (
                  <button
                    type="button"
                    disabled={busy === quote.id}
                    onClick={() => void act(quote.id, "withdraw")}
                    className="btn btn-outline btn-sm"
                  >
                    <X size={13} /> Withdraw
                  </button>
                ) : null}
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
