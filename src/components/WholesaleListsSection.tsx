"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  Search,
  X,
} from "lucide-react";
import { categoryName } from "@/lib/site";

export type WholesaleListCard = {
  id: number;
  title: string;
  supplier: string;
  description: string;
  category: string;
  audience: "public" | "trade";
  format: string;
  bytes: number;
  rowCount: number;
  columns: string[];
  preview: string[][];
  updatedAt: string;
  locked: boolean;
};

const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const scopeLabel = (category: string) => (category === "mixed" ? "All departments" : categoryName(category));

const href = (id: number, format: "xlsx" | "csv") => `/api/wholesale-lists/${id}/download?format=${format}`;

export function WholesaleListsSection({
  lists,
  signedIn,
}: {
  lists: WholesaleListCard[];
  signedIn: boolean;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const active = lists.find((list) => list.id === activeId) ?? null;

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  const rows = useMemo(() => {
    if (!active) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return active.preview;
    return active.preview.filter((row) => row.join(" ").toLowerCase().includes(needle));
  }, [active, query]);

  if (!lists.length) return null;

  return (
    <section id="wholesale-lists" className="wrap scroll-mt-32 py-16 lg:py-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">Wholesale lists · XLSX &amp; CSV</p>
          <h2 className="display mt-2 text-[32px] leading-tight sm:text-[42px]">
            Supplier product lists, ready to open in Excel.
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/65">
            Price and product lists from our wholesale partners. Preview any list on screen, or download it
            as an Excel workbook or CSV — every list is available in both formats.
          </p>
        </div>
        <span className="chip self-start lg:self-auto">
          <FileSpreadsheet size={12} /> {lists.length} list{lists.length === 1 ? "" : "s"} available
        </span>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <article
            key={list.id}
            className="flex flex-col rounded-xl border border-ink/10 bg-[#fffdf8] p-5 transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(20,36,28,0.45)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-fern/10 p-2.5 text-fern">
                {list.format === "csv" ? <FileText size={18} /> : <FileSpreadsheet size={18} />}
              </span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {list.audience === "trade" ? (
                  <span className="rounded-full bg-gold/20 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] text-[#7a5a1f] uppercase">
                    Trade accounts
                  </span>
                ) : null}
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] text-ink/55 uppercase">
                  {list.format}
                </span>
              </div>
            </div>

            <p className="mt-4 text-[10px] font-bold tracking-[0.16em] text-fern uppercase">{list.supplier}</p>
            <h3 className="mt-1 text-[16px] font-bold leading-snug">{list.title}</h3>
            {list.description ? (
              <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-ink/60">{list.description}</p>
            ) : null}

            <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-ink/8 py-3 text-center">
              <div>
                <dt className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">Rows</dt>
                <dd className="mt-0.5 text-[13px] font-bold tabular-nums">{list.rowCount}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">Scope</dt>
                <dd className="mt-0.5 truncate text-[11.5px] font-bold" title={scopeLabel(list.category)}>
                  {list.category === "mixed" ? "All" : categoryName(list.category).split(" ")[0]}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">Size</dt>
                <dd className="mt-0.5 text-[11.5px] font-bold">{formatBytes(list.bytes)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10.5px] text-ink/40">
              Updated{" "}
              {new Date(list.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>

            {list.locked ? (
              <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3.5">
                <p className="flex items-center gap-2 text-[11.5px] font-bold text-ink">
                  <Lock size={13} /> Approved trade accounts only
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink/60">
                  {signedIn
                    ? "Your account is not yet approved for wholesale pricing. Apply to unlock this list."
                    : "Sign in with an approved wholesale account to preview and download."}
                </p>
                <div className="mt-2.5 flex gap-2">
                  {!signedIn ? (
                    <Link href="/login?next=/%23wholesale-lists" className="btn btn-primary btn-sm">
                      Sign in
                    </Link>
                  ) : null}
                  <Link href="/wholesale/apply" className="btn btn-outline btn-sm">
                    Apply for trade
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-2">
                  <a href={href(list.id, "xlsx")} download className="btn btn-primary btn-sm justify-center">
                    <Download size={12} /> .xlsx
                  </a>
                  <a href={href(list.id, "csv")} download className="btn btn-outline btn-sm justify-center">
                    <Download size={12} /> .csv
                  </a>
                </div>
                <button
                  onClick={() => {
                    setQuery("");
                    setActiveId(list.id);
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-ink/15 py-2 text-[11px] font-bold text-ink/70 hover:border-ink/40 hover:text-ink"
                >
                  <Eye size={12} /> View list
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {active ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            aria-label="Close list"
            onClick={() => setActiveId(null)}
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px] animate-fade"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
            className="animate-rise relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-2xl bg-cream shadow-2xl sm:rounded-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
              <div className="min-w-0">
                <p className="eyebrow">{active.supplier}</p>
                <h3 className="mt-0.5 text-[16px] font-bold leading-snug">{active.title}</h3>
                <p className="mt-0.5 text-[11px] text-ink/50">
                  {active.rowCount} rows · {active.columns.length} columns · {scopeLabel(active.category)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={href(active.id, "xlsx")} download className="btn btn-primary btn-sm">
                  <Download size={12} /> Excel
                </a>
                <a href={href(active.id, "csv")} download className="btn btn-outline btn-sm">
                  <Download size={12} /> CSV
                </a>
                <button
                  onClick={() => setActiveId(null)}
                  aria-label="Close"
                  className="rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this list…"
                  className="w-[260px] rounded-full border border-ink/15 bg-[#fffdf8] py-2 pl-8 pr-3 text-[12px] focus:border-ink/40 focus:outline-none"
                />
              </div>
              <p className="text-[10.5px] text-ink/45">
                {rows.length === active.preview.length
                  ? `Showing ${active.preview.length} of ${active.rowCount} rows`
                  : `${rows.length} match${rows.length === 1 ? "" : "es"} in the first ${active.preview.length} rows`}
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="sticky top-0 bg-[#f7f5ef] text-[9.5px] font-bold tracking-[0.12em] text-ink/50 uppercase">
                  <tr className="border-b border-ink/10">
                    <th className="px-4 py-3 text-ink/30">#</th>
                    {active.columns.map((column, index) => (
                      <th key={`${column}-${index}`} className="px-3 py-3 whitespace-nowrap">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-ink/6 last:border-0 hover:bg-parchment/40">
                      <td className="px-4 py-2.5 text-[10.5px] text-ink/30 tabular-nums">{rowIndex + 1}</td>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={`px-3 py-2.5 ${cellIndex === 0 ? "font-mono text-[11px] font-bold text-fern" : "text-ink/75"}`}
                        >
                          {cell || <span className="text-ink/20">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={active.columns.length + 1} className="px-5 py-14 text-center text-[12px] text-ink/45">
                        No rows match “{query}”.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-parchment/50 px-5 py-3">
              <p className="text-[10.5px] text-ink/50">
                {active.rowCount > active.preview.length
                  ? `Preview is limited to the first ${active.preview.length} rows — download the file for all ${active.rowCount}.`
                  : "Complete list shown."}
              </p>
              <Link href="/quick-order" onClick={() => setActiveId(null)} className="btn btn-primary btn-sm">
                Open quick order <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
