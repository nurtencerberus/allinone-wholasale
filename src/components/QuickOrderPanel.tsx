"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardPaste,
  Download,
  FileUp,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { formatMoney } from "@/lib/money";
import { categoryName, CATEGORIES } from "@/lib/site";

export type QuickOrderSku = {
  productId: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  caseSize: number;
  casePrice: number;
  priceTiers: { minCases: number; casePrice: number }[];
  stock: number;
  image: string;
  minCases: number;
  msrpUnit: number;
  weightLbs: number;
  /** This account's agreed price for the SKU and the cases it needs, if one exists (UX-7). */
  contractCasePrice?: number | null;
  contractMinCases?: number | null;
};

type Notice = { tone: "ok" | "warn" | "error"; messages: string[] };

function effectivePrice(sku: QuickOrderSku, cases: number, discountPct: number): number {
  // A negotiated price replaces the tier price and is not discounted again (UX-7), the same
  // rule priceCart() applies on the server.
  if (sku.contractCasePrice && cases >= (sku.contractMinCases ?? sku.minCases)) return sku.contractCasePrice;
  let best = sku.casePrice;
  for (const tier of sku.priceTiers ?? []) {
    if (cases >= tier.minCases) best = Math.min(best, tier.casePrice);
  }
  return discountPct ? Math.round(best * (1 - discountPct / 100)) : best;
}

export function QuickOrderPanel({
  skus,
  wholesale,
  discountPct,
}: {
  skus: QuickOrderSku[];
  wholesale: boolean;
  discountPct: number;
}) {
  const { addItem } = useCart();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const bySku = useMemo(() => new Map(skus.map((sku) => [sku.sku.toUpperCase(), sku])), [skus]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skus.filter((sku) => {
      if (department !== "all" && sku.category !== department) return false;
      if (!needle) return true;
      return [sku.name, sku.sku, sku.brand].join(" ").toLowerCase().includes(needle);
    });
  }, [skus, query, department]);

  const selected = useMemo(
    () => skus.filter((sku) => (qty[sku.productId] ?? 0) > 0),
    [skus, qty],
  );

  const totals = useMemo(() => {
    let cases = 0;
    let weight = 0;
    let subtotal = 0;
    let units = 0;
    for (const sku of selected) {
      const count = qty[sku.productId] ?? 0;
      cases += count;
      units += count * sku.caseSize;
      weight += count * sku.weightLbs;
      subtotal += count * effectivePrice(sku, count, discountPct);
    }
    return { cases, weight, subtotal, units };
  }, [selected, qty, discountPct]);

  const setCases = (sku: QuickOrderSku, value: number) => {
    const next = Math.max(0, Math.min(sku.stock, Math.floor(Number.isFinite(value) ? value : 0)));
    setQty((current) => {
      const copy = { ...current };
      if (next === 0) delete copy[sku.productId];
      else copy[sku.productId] = next;
      return copy;
    });
    setAdded(null);
  };

  /** Replaces the table quantities with rows read from a sheet or pasted list. */
  const applyRows = (rows: { sku: string; cases: number }[], source: string) => {
    const next: Record<number, number> = {};
    const unknown: string[] = [];
    const clamped: string[] = [];
    for (const row of rows) {
      const match = bySku.get(row.sku.toUpperCase());
      if (!match) {
        unknown.push(row.sku);
        continue;
      }
      const requested = (next[match.productId] ?? 0) + row.cases;
      const limited = Math.min(requested, match.stock);
      if (limited < requested) clamped.push(`${match.sku}: ${requested} requested, only ${match.stock} in stock`);
      if (limited > 0) next[match.productId] = limited;
    }
    setQty(next);
    setAdded(null);
    setDepartment("all");
    setQuery("");

    const messages = [`${Object.keys(next).length} SKU${Object.keys(next).length === 1 ? "" : "s"} loaded from ${source}.`];
    if (unknown.length) messages.push(`Unknown SKU${unknown.length > 1 ? "s" : ""} skipped: ${unknown.join(", ")}.`);
    messages.push(...clamped);
    setNotice({
      tone: Object.keys(next).length === 0 ? "error" : unknown.length || clamped.length ? "warn" : "ok",
      messages,
    });
  };

  const uploadFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/order-sheet/import", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read that file.");
      applyRows(data.rows as { sku: string; cases: number }[], file.name);
      if ((data.warnings as string[] | undefined)?.length) {
        setNotice((current) =>
          current ? { ...current, messages: [...current.messages, ...(data.warnings as string[])] } : current,
        );
      }
    } catch (caught) {
      setNotice({
        tone: "error",
        messages: [caught instanceof Error ? caught.message : "Could not read that file."],
      });
    } finally {
      setUploading(false);
    }
  };

  const applyPasted = () => {
    const rows: { sku: string; cases: number }[] = [];
    for (const line of raw.split(/\n+/)) {
      const match = line.trim().match(/^([A-Za-z0-9-]+)[\s,;xX]+(\d+)$/);
      if (match) rows.push({ sku: match[1], cases: Math.max(1, Number(match[2])) });
    }
    if (!rows.length) {
      setNotice({
        tone: "error",
        messages: ["Add at least one line in the format SKU<space>cases (e.g. MSC-VIT-090 3)."],
      });
      return;
    }
    applyRows(rows, "pasted list");
  };

  const addAllToCart = () => {
    if (!selected.length) return;
    for (const sku of selected) {
      const count = qty[sku.productId] ?? 0;
      addItem({ productId: sku.productId, minCases: sku.minCases }, count);
    }
    setAdded(totals.cases);
    setQty({});
    setNotice(null);
  };

  const clearAll = () => {
    setQty({});
    setNotice(null);
    setAdded(null);
    setRaw("");
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void uploadFile(event.dataTransfer.files?.[0]);
      }}
    >
      {/* Toolbar --------------------------------------------------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDepartment("all")}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              department === "all"
                ? "border-ink bg-ink text-cream"
                : "border-ink/15 text-ink/72 hover:border-ink/40"
            }`}
          >
            All ({skus.length})
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.key}
              onClick={() => setDepartment(category.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                department === category.key
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/15 text-ink/72 hover:border-ink/40"
              }`}
            >
              {category.shortName} ({skus.filter((sku) => sku.category === category.key).length})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
            <input aria-label="Filter SKUs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item, SKU or brand…"
              className="w-[230px] rounded-full border border-ink/15 bg-[#fffdf8] py-2 pl-8 pr-3 text-[12px] focus:border-ink/40 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="btn btn-outline btn-sm"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
            Upload XLS / CSV
          </button>
          <input aria-label="Order sheet file (.xlsx, .xls or .csv)"
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            className="hidden"
            onChange={(event) => {
              void uploadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button onClick={() => setPasteOpen((open) => !open)} className="btn btn-outline btn-sm">
            <ClipboardPaste size={13} /> Paste list
          </button>
          <a href="/api/order-sheet/download?format=xlsx" download className="btn btn-outline btn-sm">
            <Download size={13} /> Order sheet
          </a>
          {selected.length ? (
            <button onClick={clearAll} className="btn btn-sm border border-clay/30 text-clay hover:bg-clay/10">
              <X size={13} /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {pasteOpen ? (
        <div className="mt-3 rounded-xl border border-ink/12 bg-[#fffdf8] p-4">
          <p className="text-[11px] text-ink/70">
            One line per SKU: <code className="rounded bg-parchment px-1">SKU cases</code> — comma, “x” or
            semicolon separators also work. Quantities fill the table below.
          </p>
          <textarea aria-label="Paste SKUs and case quantities"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"MSC-VIT-090 4\nMSC-OM3-120 2\nMSC-PAN-OO1L 6"}
            className="field mt-2 min-h-[110px] font-mono text-[12px]"
            spellCheck={false}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={applyPasted} disabled={!raw.trim()} className="btn btn-primary btn-sm">
              Fill the table
            </button>
            <button
              onClick={() =>
                setRaw(skus.slice(0, 3).map((sku, index) => `${sku.sku} ${index + 1}`).join("\n"))
              }
              className="btn btn-outline btn-sm"
            >
              Load example
            </button>
          </div>
        </div>
      ) : null}

      {dragOver ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-fern bg-fern/8 py-6 text-[12px] font-bold text-fern">
          <FileUp size={16} /> Drop your .xlsx / .xls / .csv order sheet to fill the table
        </div>
      ) : null}

      {notice ? (
        <div
          className={`mt-3 rounded-lg border px-4 py-3 ${
            notice.tone === "ok"
              ? "border-fern/25 bg-fern/5 text-fern"
              : notice.tone === "warn"
                ? "border-gold/40 bg-gold/10 text-[#7a5a1f]"
                : "border-clay/30 bg-clay/10 text-clay"
          }`}
        >
          {notice.messages.map((message, index) => (
            <p key={message} className={`flex items-start gap-2 text-[11.5px] ${index === 0 ? "font-semibold" : ""}`}>
              {index === 0 ? (
                notice.tone === "ok" ? (
                  <Check size={13} className="mt-0.5 shrink-0" />
                ) : (
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                )
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {added !== null ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-fern/25 bg-fern/5 px-4 py-3 text-[12px] font-semibold text-fern">
          <span className="flex items-center gap-2">
            <Check size={14} /> {added} case{added === 1 ? "" : "s"} added to your cart — freight and tax are
            priced at checkout.
          </span>
          <Link href="/checkout" className="btn btn-primary btn-sm">
            Go to checkout
          </Link>
        </div>
      ) : null}

      {/* Table ----------------------------------------------------- */}
      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-[#fffdf8]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead>
              <tr className="border-b border-ink/10 bg-[#f7f5ef] text-[10px] font-bold tracking-[0.14em] text-ink/70 uppercase">
                <th scope="col" className="px-5 py-3.5">Item &amp; SKU</th>
                <th scope="col" className="px-3 py-3.5">Department</th>
                <th scope="col" className="px-3 py-3.5">Pack size</th>
                <th scope="col" className="px-3 py-3.5">Case weight</th>
                <th scope="col" className="px-3 py-3.5">Case price</th>
                <th scope="col" className="px-3 py-3.5">In stock</th>
                <th scope="col" className="px-3 py-3.5 text-center">Order case qty</th>
                <th scope="col" className="px-5 py-3.5 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sku) => {
                const count = qty[sku.productId] ?? 0;
                const price = effectivePrice(sku, count, discountPct);
                const base = discountPct ? Math.round(sku.casePrice * (1 - discountPct / 100)) : sku.casePrice;
                const tierApplied = count > 0 && price < base;
                const nextTier = (sku.priceTiers ?? []).find((tier) => count < tier.minCases);
                const lowStock = sku.stock <= 10;
                return (
                  <tr
                    key={sku.productId}
                    className={`border-b border-ink/8 transition-colors last:border-0 ${
                      count > 0 ? "bg-fern/[0.06]" : "hover:bg-parchment/30"
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-4">
                        <Link href={`/products/${sku.slug}`} className="shrink-0">
                          <Image
                            src={sku.image}
                            alt={sku.name}
                            width={60}
                            height={60}
                            className="h-[60px] w-[60px] rounded-lg border border-ink/10 object-cover"
                          />
                        </Link>
                        <div className="min-w-0">
                          <p className="font-mono text-[11.5px] font-bold tracking-wide text-fern">{sku.sku}</p>
                          <Link
                            href={`/products/${sku.slug}`}
                            className="mt-0.5 block max-w-[360px] truncate text-[14px] font-bold leading-snug hover:underline"
                            title={sku.name}
                          >
                            {sku.name}
                          </Link>
                          <p className="mt-0.5 text-[11.5px] text-ink/68">{sku.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] text-ink/75">
                      <span className="block max-w-[120px] leading-snug">{categoryName(sku.category)}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-block rounded-md bg-ink/[0.06] px-2.5 py-1 text-[12px] font-semibold leading-snug text-ink/75">
                        {sku.caseSize} unit{sku.caseSize === 1 ? "" : "s"} / case
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] tabular-nums text-ink/70">
                      {sku.weightLbs.toFixed(2)} lbs
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-[17px] font-extrabold tabular-nums">{formatMoney(price)}</p>
                      {tierApplied ? (
                        <p className="text-[10.5px] font-semibold text-fern">
                          Volume tier · was {formatMoney(base)}
                        </p>
                      ) : nextTier ? (
                        <p className="text-[10.5px] text-ink/65">
                          {nextTier.minCases}+ cases: {formatMoney(
                            discountPct ? Math.round(nextTier.casePrice * (1 - discountPct / 100)) : nextTier.casePrice,
                          )}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3.5">
                      <p className={`text-[14px] font-bold leading-tight tabular-nums ${lowStock ? "text-clay" : "text-fern"}`}>
                        {sku.stock}
                      </p>
                      <p className={`text-[12.5px] font-semibold leading-tight ${lowStock ? "text-clay" : "text-fern"}`}>
                        cases
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="mx-auto flex w-[118px] items-center justify-between rounded-full border border-ink/20 bg-white px-1 py-1">
                        <button
                          onClick={() => setCases(sku, count - 1)}
                          disabled={count === 0}
                          aria-label={`Decrease ${sku.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/72 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={sku.stock}
                          inputMode="numeric"
                          value={count}
                          onChange={(event) => setCases(sku, Number(event.target.value))}
                          onFocus={(event) => event.target.select()}
                          aria-label={`Cases of ${sku.name}`}
                          className="w-9 bg-transparent text-center text-[14px] font-bold tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => setCases(sku, count + 1)}
                          disabled={count >= sku.stock}
                          aria-label={`Increase ${sku.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/72 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[16px] font-extrabold tabular-nums">
                      <span className={count > 0 ? "text-ink" : "text-ink/70"}>{formatMoney(price * count)}</span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-[12.5px] text-ink/65">
                    No SKUs match “{query}”.{" "}
                    <button
                      className="font-bold underline"
                      onClick={() => {
                        setQuery("");
                        setDepartment("all");
                      }}
                    >
                      Reset filters
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink/65">
        {wholesale
          ? `Trade pricing active — your ${discountPct}% contract discount is included in the prices above. `
          : "Catalog case pricing shown. "}
        Volume tiers resolve per line. Freight weight is actual carton weight; dimensional (L × W × H ÷ 139)
        billing and destination sales tax are calculated at checkout.
      </p>

      {/* Sticky summary bar ----------------------------------------- */}
      <div className="sticky bottom-4 z-30 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-2xl border border-cream/10 bg-[#101a2c] px-6 py-4 text-cream shadow-[0_24px_60px_-20px_rgba(10,18,32,0.7)]">
          <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
            <div>
              <p className="text-[11px] text-cream/50">Selected SKUs</p>
              <p className="text-[20px] font-bold leading-tight tabular-nums">
                {selected.length} product{selected.length === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-cream/50">Total cases</p>
              <p className="text-[20px] font-bold leading-tight tabular-nums">
                {totals.cases} case{totals.cases === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-cream/50">Freight weight</p>
              <p className="text-[20px] font-bold leading-tight tabular-nums text-[#f6c84c]">
                {totals.weight.toFixed(1)} lbs
              </p>
            </div>
            <div>
              <p className="text-[11px] text-cream/50">Subtotal</p>
              <p className="text-[26px] font-extrabold leading-tight tabular-nums text-[#3ddc97]">
                {formatMoney(totals.subtotal)}
              </p>
            </div>
          </div>

          <button
            onClick={addAllToCart}
            disabled={totals.cases === 0}
            className="flex items-center gap-2.5 rounded-xl bg-[#2fa66d] px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[#35b97a] disabled:cursor-not-allowed disabled:bg-[#1f4a3a] disabled:text-white/50"
          >
            <Package size={18} />
            Add {totals.cases} Case{totals.cases === 1 ? "" : "s"} to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
