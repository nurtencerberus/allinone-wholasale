"use client";

import { useState } from "react";
import { Check, Download, FileJson, Loader2, TriangleAlert, Upload } from "lucide-react";

type ImportResult = {
  created: string[];
  updated: string[];
  errors: string[];
  warnings: string[];
};

const SAMPLE = `{
  "currency": "cents",
  "products": [
    {
      "sku": "MSC-NEW-001",
      "name": "Collagen Peptides 16 oz",
      "category": "supplements",
      "brand": "Ciputra Labs",
      "description": "Grass-fed bovine collagen peptides, unflavoured.",
      "gtin": "012345678905",
      "asin": "B0ABC12345",
      "countryOfOrigin": "US",
      "caseSize": 12,
      "casePrice": 14400,
      "msrpUnit": 2499,
      "costPrice": 9600,
      "weightLbs": 15,
      "dimensions": { "l": 15, "w": 11, "h": 9 },
      "stock": 40,
      "lot": "COL-2611",
      "bestBy": "2028-06-30",
      "features": ["Grass-fed", "Unflavoured"]
    }
  ]
}`;

export function CatalogTransfer({ productCount }: { productCount: number }) {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const submit = async (payload: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setProblems([]);
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) {
        setProblems([...(data.errors ?? []), ...(data.warnings ?? [])]);
        throw new Error(data.errors?.length > 1 ? `Nothing was imported — fix the ${data.errors.length} problems below.` : (data.error ?? "Import failed."));
      }
      setResult(data as ImportResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
          <FileJson size={13} /> Catalog transfer
        </p>
        <div className="flex gap-1.5">
          {(["export", "import"] as const).map((entry) => (
            <button
              key={entry}
              onClick={() => setTab(entry)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
                tab === entry ? "bg-ink text-cream" : "bg-white text-ink/70 hover:text-ink"
              }`}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      {tab === "export" ? (
        <div className="p-5">
          <h2 className="display text-[22px] leading-tight">Move this catalog to another project</h2>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink/72">
            Downloads the full catalog as JSON — {productCount} SKUs with case pricing, volume tiers,
            carton dimensions, weights, imagery paths, features and specs. Money fields are integer
            cents. Edit the file and import it back, or use it to seed another storefront.
          </p>
          <a href="/api/admin/catalog" download className="btn btn-primary btn-sm mt-4">
            <Download size={13} /> Download catalog JSON
          </a>
          <div className="mt-4 rounded-lg border border-ink/10 bg-parchment/30 px-3.5 py-3">
            <p className="text-[10px] font-bold tracking-[0.12em] text-ink/65 uppercase">
              Also available
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="/api/order-sheet/download?format=xlsx" download className="btn btn-outline btn-sm">
                <Download size={12} /> Excel order sheet
              </a>
              <a href="/api/order-sheet/download?format=csv" download className="btn btn-outline btn-sm">
                <Download size={12} /> CSV order sheet
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <h2 className="display text-[22px] leading-tight">Import products from another project</h2>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink/72">
            Paste JSON or load a file. Rows are matched on <strong>SKU</strong>: existing products are
            updated (their link and stock stay as they are), new ones are created with optional opening stock as
            their first lot. Every row is checked like the product form — if any row fails, nothing is imported. Accepts <code className="rounded bg-parchment px-1">name</code>,{" "}
            <code className="rounded bg-parchment px-1">price</code>,{" "}
            <code className="rounded bg-parchment px-1">qty</code> style field names too — set{" "}
            <code className="rounded bg-parchment px-1">&quot;currency&quot;: &quot;usd&quot;</code> if prices
            are in dollars instead of cents.
          </p>

          <textarea aria-label="Catalog JSON"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={SAMPLE}
            spellCheck={false}
            className="field mt-3 min-h-[170px] font-mono text-[11px]"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => submit(text)} disabled={busy || !text.trim()} className="btn btn-primary btn-sm">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import JSON
            </button>
            <label className="btn btn-outline btn-sm cursor-pointer">
              Load file
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const payload = await file.text();
                  setText(payload);
                  void submit(payload);
                  event.target.value = "";
                }}
              />
            </label>
            <button onClick={() => setText(SAMPLE)} className="btn btn-outline btn-sm">
              Load example
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11px] text-clay">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {error}
            </p>
          ) : null}
          {problems.length ? (
            <ul className="mt-2 max-h-[240px] space-y-1 overflow-y-auto text-[10.5px] text-clay">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          {result ? (
            <div className="mt-3 rounded-lg border border-fern/25 bg-fern/5 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fern">
                <Check size={13} /> {result.created.length} created · {result.updated.length} updated
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px] text-ink/72">
                {result.created.length ? (
                  <p>
                    <span className="font-bold text-ink">Created:</span> {result.created.join(", ")}
                  </p>
                ) : null}
                {result.updated.length ? (
                  <p>
                    <span className="font-bold text-ink">Updated:</span> {result.updated.join(", ")}
                  </p>
                ) : null}
              </div>
              {[...result.errors, ...result.warnings].map((message) => (
                <p key={message} className="mt-1 flex items-start gap-1.5 text-[10.5px] text-[#7a5a1f]">
                  <TriangleAlert size={11} className="mt-0.5 shrink-0" /> {message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
