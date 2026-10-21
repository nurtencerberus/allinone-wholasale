"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Search,
  X,
} from "lucide-react";
import type { StaticDownload } from "@/lib/downloads";
import { formatMoney } from "@/lib/money";
import { CATEGORIES, categoryName } from "@/lib/site";

export type PriceListProduct = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  caseSize: number;
  casePrice: number;
  priceTiers: { minCases: number; casePrice: number }[];
  msrpUnit: number;
  stock: number;
  weightLbs: number;
  slug: string;
};

type Scope = "all" | (typeof CATEGORIES)[number]["key"];

const formatLabel = (ext: string) =>
  ext === "csv" ? "CSV" : ext === "xls" ? "Excel 97–2003" : "Excel workbook";

function downloadHref(scope: Scope, format: "xlsx" | "csv") {
  return `/api/order-sheet/download?format=${format}${scope === "all" ? "" : `&category=${scope}`}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PriceListSection({
  products,
  counts,
  total,
  files,
}: {
  /** The rows on the page — a preview of a large catalogue, the whole of a small one (UX-6). */
  products: PriceListProduct[];
  /** SKUs per department, counted in the database rather than from the rows above. */
  counts: { category: string; count: number }[];
  total: number;
  files: StaticDownload[];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Counted in the database: the page carries at most a preview of the rows.
  const countFor = (key: Scope) =>
    key === "all" ? total : (counts.find((row) => row.category === key)?.count ?? 0);
  const truncated = total > products.length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (scope !== "all" && product.category !== scope) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.brand].join(" ").toLowerCase().includes(needle);
    });
  }, [products, scope, query]);

  const lists: { scope: Scope; title: string; blurb: string }[] = [
    {
      scope: "all",
      title: "Complete wholesale price list",
      blurb: "Every SKU with case price, volume tiers, MSRP, margin, stock and carton data.",
    },
    ...CATEGORIES.map((category) => ({
      scope: category.key as Scope,
      title: category.name,
      blurb: category.blurb,
    })),
  ];

  return (
    <section id="price-lists" className="scroll-mt-32 border-y border-ink/10 bg-parchment/40 py-16 lg:py-20">
      <div className="wrap">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">Product lists · XLSX &amp; CSV</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[42px]">
              Download the wholesale price list. Open it in Excel.
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink/65">
              Live from the catalog — SKUs, case sizes, volume-tier pricing, MSRP, retail margin and
              carton weights. Fill the highlighted quantity column and upload it back at{" "}
              <Link href="/quick-order" className="font-bold underline underline-offset-4">
                Quick order
              </Link>{" "}
              to build a purchase order in seconds.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setScope("all");
                setQuery("");
                setOpen(true);
              }}
              className="btn btn-primary"
            >
              <Eye size={15} /> View product list
            </button>
            <a href={downloadHref("all", "xlsx")} download className="btn btn-outline">
              <Download size={15} /> Excel (.xlsx)
            </a>
            <a href={downloadHref("all", "csv")} download className="btn btn-outline">
              <Download size={15} /> CSV
            </a>
          </div>
        </div>

        {/* Generated lists ------------------------------------------ */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {lists.map((list, index) => (
            <div
              key={list.scope}
              className={`flex flex-col rounded-xl border p-5 ${
                index === 0 ? "border-ink bg-ink text-cream" : "border-ink/10 bg-[#fffdf8]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`rounded-full p-2.5 ${
                    index === 0 ? "bg-cream/12 text-cream" : "bg-fern/10 text-fern"
                  }`}
                >
                  <FileSpreadsheet size={17} />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${
                    index === 0 ? "bg-cream/12 text-cream/80" : "bg-ink/[0.06] text-ink/70"
                  }`}
                >
                  {countFor(list.scope)} SKUs
                </span>
              </div>
              <h3 className={`mt-4 text-[14px] font-bold leading-snug ${index === 0 ? "text-cream" : ""}`}>
                {list.title}
              </h3>
              <p
                className={`mt-1.5 line-clamp-3 flex-1 text-[11.5px] leading-relaxed ${
                  index === 0 ? "text-cream/60" : "text-ink/70"
                }`}
              >
                {list.blurb}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={downloadHref(list.scope, "xlsx")}
                  download
                  className={`btn btn-sm justify-center ${
                    index === 0 ? "btn-light" : "btn-primary"
                  }`}
                >
                  <Download size={12} /> .xlsx
                </a>
                <a
                  href={downloadHref(list.scope, "csv")}
                  download
                  className={`btn btn-sm justify-center ${
                    index === 0
                      ? "border border-cream/30 text-cream hover:bg-cream/10"
                      : "btn-outline"
                  }`}
                >
                  <Download size={12} /> .csv
                </a>
              </div>
              <button
                onClick={() => {
                  setScope(list.scope);
                  setQuery("");
                  setOpen(true);
                }}
                className={`mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold underline-offset-4 hover:underline ${
                  index === 0 ? "text-cream/80" : "text-fern"
                }`}
              >
                <Eye size={12} /> Preview list
              </button>
            </div>
          ))}
        </div>

        {/* Files from public/downloads ------------------------------- */}
        {files.length ? (
          <div className="mt-8">
            <p className="text-[10.5px] font-bold tracking-[0.18em] text-ink/65 uppercase">
              Supplier files &amp; catalogs
            </p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {files.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center gap-4 rounded-xl border border-ink/10 bg-[#fffdf8] p-4"
                >
                  <span className="rounded-lg bg-fern/10 p-3 text-fern">
                    {file.ext === "csv" ? <FileText size={20} /> : <FileSpreadsheet size={20} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold" title={file.name}>
                      {file.name}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink/68">
                      {formatLabel(file.ext)} · {formatBytes(file.bytes)} · updated{" "}
                      {new Date(file.modifiedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <a href={file.href} download className="btn btn-primary btn-sm shrink-0">
                    <Download size={12} /> .{file.ext}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-6 text-[10.5px] leading-relaxed text-ink/65">
          Prices in USD per case, FOB Paterson NJ. Lists are regenerated from live inventory on every
          download. Approved trade accounts see contract pricing in{" "}
          <Link href="/quick-order" className="underline">
            Quick order
          </Link>
          .
        </p>
      </div>

      {/* Preview modal ------------------------------------------------ */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            aria-label="Close product list"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px] animate-fade"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Wholesale product list"
            className="animate-rise relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-2xl bg-cream shadow-2xl sm:rounded-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
              <div>
                <p className="eyebrow">Wholesale product list</p>
                <p className="mt-0.5 text-[13px] font-bold">
                  {rows.length} of {truncated ? `${products.length} shown (${total} total)` : `${products.length} SKUs`} ·{" "}
                  {scope === "all" ? "All departments" : categoryName(scope)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={downloadHref(scope, "xlsx")} download className="btn btn-primary btn-sm">
                  <Download size={12} /> Excel
                </a>
                <a href={downloadHref(scope, "csv")} download className="btn btn-outline btn-sm">
                  <Download size={12} /> CSV
                </a>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-2 text-ink/72 hover:bg-ink/5 hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-ink/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {([{ key: "all", shortName: "All" }, ...CATEGORIES] as { key: Scope; shortName: string }[]).map(
                  (entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setScope(entry.key)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        scope === entry.key
                          ? "border-ink bg-ink text-cream"
                          : "border-ink/15 text-ink/72 hover:border-ink/40"
                      }`}
                    >
                      {entry.shortName} ({countFor(entry.key)})
                    </button>
                  ),
                )}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
                <input aria-label="Filter the price list"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search item, SKU or brand…"
                  className="w-full rounded-full border border-ink/15 bg-[#fffdf8] py-2 pl-8 pr-3 text-[12px] focus:border-ink/40 focus:outline-none sm:w-[240px]"
                />
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[860px] text-left text-[12px]">
                <thead className="sticky top-0 bg-[#f7f5ef] text-[9.5px] font-bold tracking-[0.12em] text-ink/68 uppercase">
                  <tr className="border-b border-ink/10">
                    <th scope="col" className="px-5 py-3">SKU</th>
                    <th scope="col" className="px-3 py-3">Product</th>
                    <th scope="col" className="px-3 py-3">Department</th>
                    <th scope="col" className="px-3 py-3">Pack</th>
                    <th scope="col" className="px-3 py-3 text-right">Case</th>
                    <th scope="col" className="px-3 py-3 text-right">2+</th>
                    <th scope="col" className="px-3 py-3 text-right">5+</th>
                    <th scope="col" className="px-3 py-3 text-right">10+</th>
                    <th scope="col" className="px-3 py-3 text-right">MSRP</th>
                    <th scope="col" className="px-3 py-3 text-right">Margin</th>
                    <th scope="col" className="px-5 py-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => {
                    const tier = (min: number) =>
                      [...product.priceTiers]
                        .sort((a, b) => a.minCases - b.minCases)
                        .find((entry) => entry.minCases >= min)?.casePrice ?? product.casePrice;
                    const msrpCase = product.msrpUnit * product.caseSize;
                    const margin = msrpCase
                      ? Math.round(((msrpCase - product.casePrice) / msrpCase) * 100)
                      : 0;
                    return (
                      <tr key={product.sku} className="border-b border-ink/6 last:border-0 hover:bg-parchment/40">
                        <td className="px-5 py-2.5 font-mono text-[11px] font-bold text-fern">{product.sku}</td>
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/products/${product.slug}`}
                            onClick={() => setOpen(false)}
                            className="font-semibold hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="text-[10px] text-ink/65">{product.brand}</p>
                        </td>
                        <td className="px-3 py-2.5 text-ink/72">{categoryName(product.category)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink/72">
                          {product.caseSize} / case
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                          {formatMoney(product.casePrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-ink/72 tabular-nums">{formatMoney(tier(2))}</td>
                        <td className="px-3 py-2.5 text-right text-ink/72 tabular-nums">{formatMoney(tier(5))}</td>
                        <td className="px-3 py-2.5 text-right text-ink/72 tabular-nums">{formatMoney(tier(10))}</td>
                        <td className="px-3 py-2.5 text-right text-ink/72 tabular-nums">
                          {formatMoney(product.msrpUnit)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="rounded-full bg-fern/10 px-2 py-0.5 text-[10px] font-bold text-fern">
                            {margin}%
                          </span>
                        </td>
                        <td
                          className={`px-5 py-2.5 text-right font-semibold tabular-nums ${
                            product.stock <= 10 ? "text-clay" : "text-ink/72"
                          }`}
                        >
                          {product.stock}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-14 text-center text-[12px] text-ink/65">
                        No SKUs match “{query}”{truncated ? " in the rows on this page" : ""}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-parchment/50 px-5 py-3">
              <p className="text-[10.5px] text-ink/68">
                USD per case, FOB Paterson NJ · 2+/5+/10+ are volume-tier case prices.
                {truncated
                  ? ` This table shows ${products.length} of ${total} SKUs — the Excel and CSV downloads carry every one.`
                  : ""}
              </p>
              <Link href="/quick-order" onClick={() => setOpen(false)} className="btn btn-primary btn-sm">
                Order from this list <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
