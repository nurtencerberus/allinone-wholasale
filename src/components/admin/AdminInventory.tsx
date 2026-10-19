"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus, Search } from "lucide-react";
import { formatIsoDate } from "@/lib/money";

export type InventoryLot = {
  id: number;
  productId: number;
  lotNumber: string;
  expiresOn: string | null;
  supplier: string | null;
  qtyReceived: number;
  qtyOnHand: number;
  qtyQuarantine: number;
  status: string;
  receivedAt: string;
  expiringSoon: boolean;
};

export type InventoryProduct = {
  id: number;
  sku: string;
  name: string;
  stock: number;
  reorderPoint: number;
  active: boolean;
  taxClass: string;
  lots: InventoryLot[];
};

const STATUS_STYLE: Record<string, string> = {
  available: "bg-fern/15 text-fern",
  hold: "bg-gold/20 text-[#7a5a1f]",
  expired: "bg-ink/10 text-ink/50",
  recalled: "bg-clay/15 text-clay",
};

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Inventory update failed.");
  return data as { message: string };
}

export function AdminInventory({ products, canEdit }: { products: InventoryProduct[]; canEdit: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receive, setReceive] = useState({ productId: "", lotNumber: "", expiresOn: "", cases: "", supplier: "", note: "" });

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.sku, product.name, ...product.lots.map((lot) => lot.lotNumber)].join(" ").toLowerCase().includes(needle),
    );
  }, [products, query]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await post(body);
      setMessage(data.message);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inventory update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (lot: InventoryLot, bucket: "on_hand" | "quarantine") => {
    const raw = window.prompt(
      `Lot ${lot.lotNumber}: change ${bucket === "on_hand" ? "on-hand" : "quarantine"} cases by (e.g. -2 or 5):`,
    );
    if (!raw) return;
    const reason = window.prompt("Reason: count, damage, writeoff, found or adjust", bucket === "quarantine" ? "writeoff" : "count");
    if (!reason) return;
    const note = window.prompt("Note (required — what happened?)");
    if (!note) return;
    await run({ action: "adjust", lotId: lot.id, delta: Number(raw), bucket, reason: reason.trim(), note });
  };

  const setStatus = async (lot: InventoryLot, status: string) => {
    const note = window.prompt(`Set lot ${lot.lotNumber} to ${status}. Note:`) ?? "";
    if (status === "recalled" && !window.confirm(`Recall lot ${lot.lotNumber}? A recalled lot can never be sold again.`)) return;
    await run({ action: "status", lotId: lot.id, status, note });
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form
          className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_0.7fr_1fr_auto]"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await run({ action: "receive", ...receive, productId: Number(receive.productId), cases: Number(receive.cases) });
            if (ok) setReceive({ productId: receive.productId, lotNumber: "", expiresOn: "", cases: "", supplier: receive.supplier, note: "" });
          }}
        >
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase sm:col-span-2 lg:col-span-6">
            <PackagePlus size={13} /> Receive goods
          </p>
          <select
            required
            className="field"
            value={receive.productId}
            onChange={(event) => setReceive({ ...receive, productId: event.target.value })}
            aria-label="Product"
          >
            <option value="">Product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} — {product.name}
              </option>
            ))}
          </select>
          <input required className="field" placeholder="Lot number" value={receive.lotNumber} onChange={(event) => setReceive({ ...receive, lotNumber: event.target.value })} aria-label="Lot number" />
          <input type="date" className="field" value={receive.expiresOn} onChange={(event) => setReceive({ ...receive, expiresOn: event.target.value })} aria-label="Best-by date" title="Best-by date (required for food and supplements)" />
          <input required type="number" min={1} className="field" placeholder="Cases" value={receive.cases} onChange={(event) => setReceive({ ...receive, cases: event.target.value })} aria-label="Cases" />
          <input className="field" placeholder="Supplier / PO" value={receive.supplier} onChange={(event) => setReceive({ ...receive, supplier: event.target.value })} aria-label="Supplier" />
          <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} Receive
          </button>
        </form>
      ) : null}

      {message ? <p className="rounded-md border border-fern/30 bg-fern/10 px-3 py-2 text-[11.5px] font-medium text-fern">{message}</p> : null}
      {error ? <p className="rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] font-medium text-clay">{error}</p> : null}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-parchment/50 px-4 py-3">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Stock by lot</p>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SKU, name or lot…"
              className="w-[210px] rounded-full border border-ink/15 bg-white py-1.5 pl-7 pr-3 text-[11px] focus:border-ink/40 focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[11px]">
            <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
              <tr className="border-b border-ink/8">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-2 py-2.5 text-right">Sellable</th>
                <th className="px-2 py-2.5">Lot</th>
                <th className="px-2 py-2.5">Best by</th>
                <th className="px-2 py-2.5 text-right">On hand</th>
                <th className="px-2 py-2.5 text-right">Quarantine</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const rows = product.lots.length ? product.lots : [null];
                const low = product.active && product.stock <= product.reorderPoint;
                return rows.map((lot, index) => (
                  <tr key={`${product.id}-${lot?.id ?? "none"}`} className={`align-top ${index === rows.length - 1 ? "border-b border-ink/8" : ""}`}>
                    {index === 0 ? (
                      <>
                        <td className="px-4 py-2.5" rowSpan={rows.length}>
                          <p className="font-bold">{product.sku}</p>
                          <p className="text-[10px] text-ink/55">{product.name}</p>
                          {!product.active ? <p className="text-[9px] text-ink/40 uppercase">Archived</p> : null}
                        </td>
                        <td className="px-2 py-2.5 text-right" rowSpan={rows.length}>
                          <p className={`font-bold tabular-nums ${low ? "text-clay" : ""}`}>{product.stock}</p>
                          <p className="text-[9px] text-ink/40">reorder at {product.reorderPoint}</p>
                        </td>
                      </>
                    ) : null}
                    {lot ? (
                      <>
                        <td className="px-2 py-2.5 font-mono">
                          {lot.lotNumber}
                          {lot.supplier ? <span className="block font-sans text-[9px] text-ink/40">{lot.supplier}</span> : null}
                        </td>
                        <td className={`px-2 py-2.5 ${lot.expiringSoon ? "font-semibold text-clay" : ""}`}>
                          {lot.expiringSoon ? <AlertTriangle size={11} className="mr-1 inline" /> : null}
                          {lot.expiresOn ? (
                            formatIsoDate(lot.expiresOn)
                          ) : product.taxClass !== "general" ? (
                            canEdit ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="font-semibold text-clay underline"
                                onClick={() => {
                                  const value = window.prompt(`Best-by date for lot ${lot.lotNumber} (YYYY-MM-DD):`);
                                  if (value) void run({ action: "expiry", lotId: lot.id, expiresOn: value.trim() });
                                }}
                              >
                                Best-by missing — enter
                              </button>
                            ) : (
                              <span className="font-semibold text-clay">Best-by missing</span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{lot.qtyOnHand}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{lot.qtyQuarantine || "—"}</td>
                        <td className="px-2 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_STYLE[lot.status] ?? ""}`}>{lot.status}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {canEdit ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold">
                              <button type="button" disabled={busy} className="text-fern hover:underline" onClick={() => adjust(lot, "on_hand")}>Adjust</button>
                              {lot.qtyQuarantine > 0 ? (
                                <button type="button" disabled={busy} className="text-ink/60 hover:underline" onClick={() => adjust(lot, "quarantine")}>Quarantine</button>
                              ) : null}
                              {lot.status === "available" ? (
                                <button type="button" disabled={busy} className="text-[#7a5a1f] hover:underline" onClick={() => setStatus(lot, "hold")}>Hold</button>
                              ) : null}
                              {lot.status === "hold" ? (
                                <button type="button" disabled={busy} className="text-fern hover:underline" onClick={() => setStatus(lot, "available")}>Release</button>
                              ) : null}
                              {lot.status !== "recalled" ? (
                                <button type="button" disabled={busy} className="text-clay hover:underline" onClick={() => setStatus(lot, "recalled")}>Recall</button>
                              ) : null}
                              <a className="text-ink/50 hover:underline" href={`/admin/inventory?lot=${encodeURIComponent(lot.lotNumber)}#recall`}>Orders</a>
                            </div>
                          ) : null}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-2 py-2.5 text-ink/45">No lots on hand — receive goods to sell this product.</td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
