"use client";

import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { formatMoney } from "@/lib/money";

export type AccountPriceRow = {
  productId: number;
  sku: string;
  name: string;
  listCasePrice: number;
  casePrice: number;
  minCases: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  note: string | null;
};

export type PricebookProduct = {
  id: number;
  sku: string;
  name: string;
  casePrice: number;
  minCases: number;
};

type FormState = {
  productId: string;
  casePrice: string;
  minCases: string;
  startsAt: string;
  expiresAt: string;
  note: string;
};

const BLANK: FormState = { productId: "", casePrice: "", minCases: "", startsAt: "", expiresAt: "", note: "" };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function windowLabel(row: AccountPriceRow): string {
  const from = row.startsAt ? new Date(row.startsAt).toLocaleDateString() : null;
  const to = row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return "open-ended";
}

export function AccountPriceList({
  accountId,
  rows,
  products,
  canEdit,
}: {
  accountId: number;
  rows: AccountPriceRow[];
  products: PricebookProduct[];
  canEdit: boolean;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (row: AccountPriceRow) =>
    setForm({
      productId: String(row.productId),
      casePrice: (row.casePrice / 100).toFixed(2),
      minCases: row.minCases === null ? "" : String(row.minCases),
      startsAt: toLocalInput(row.startsAt),
      expiresAt: toLocalInput(row.expiresAt),
      note: row.note ?? "",
    });

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/accounts/${accountId}/prices`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: Number(form.productId),
          casePrice: Number(form.casePrice),
          minCases: form.minCases,
          startsAt: form.startsAt,
          expiresAt: form.expiresAt,
          note: form.note,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save the price.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — the price was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (productId: number) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/accounts/${accountId}/prices?productId=${productId}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not remove the price.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — the price was not removed.");
    } finally {
      setBusy(false);
    }
  };

  const selected = products.find((product) => String(product.id) === form?.productId);

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setForm(form ? null : BLANK)} className="btn btn-primary btn-sm">
            {form ? <X size={14} /> : <Plus size={14} />} {form ? "Close" : "Agree a price"}
          </button>
        </div>
      ) : null}

      {form ? (
        <div className="card p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="label">Product</span>
              <select
                className="field"
                value={form.productId}
                onChange={(event) => setForm({ ...form, productId: event.target.value })}
              >
                <option value="">Choose a SKU…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} ({formatMoney(product.casePrice)} list)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Agreed case price ($)</span>
              <input
                className="field"
                inputMode="decimal"
                value={form.casePrice}
                onChange={(event) => setForm({ ...form, casePrice: event.target.value })}
                placeholder={selected ? (selected.casePrice / 100).toFixed(2) : "0.00"}
              />
            </label>
            <label className="block">
              <span className="label">From this many cases (blank = product minimum)</span>
              <input
                className="field"
                inputMode="numeric"
                value={form.minCases}
                onChange={(event) => setForm({ ...form, minCases: event.target.value })}
                placeholder={selected ? String(selected.minCases) : ""}
              />
            </label>
            <label className="block">
              <span className="label">Starts (optional)</span>
              <input
                type="datetime-local"
                className="field"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Ends (optional)</span>
              <input
                type="datetime-local"
                className="field"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Internal note</span>
              <input
                className="field"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Agreed on the 2026 annual call"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="btn btn-outline btn-sm">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">
              <Save size={14} /> {busy ? "Saving…" : "Save price"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[11.5px]">
          <thead className="border-b border-ink/10 bg-parchment/50 text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">
            <tr>
              <th scope="col" className="px-4 py-2.5">SKU</th>
              <th scope="col" className="px-4 py-2.5 text-right">List</th>
              <th scope="col" className="px-4 py-2.5 text-right">Agreed</th>
              <th scope="col" className="px-4 py-2.5 text-right">Difference</th>
              <th scope="col" className="px-4 py-2.5">From</th>
              <th scope="col" className="px-4 py-2.5">Window</th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink/65">
                  No agreed prices: this account pays list, less its percentage discount.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const diff = row.listCasePrice - row.casePrice;
              return (
                <tr key={row.productId}>
                  <td className="px-4 py-3">
                    <p className="font-bold">{row.sku}</p>
                    <p className="text-[10.5px] text-ink/65">{row.name}</p>
                    {row.note ? <p className="text-[10.5px] text-ink/65">{row.note}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.listCasePrice)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(row.casePrice)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${diff > 0 ? "text-fern" : diff < 0 ? "text-clay" : ""}`}>
                    {diff === 0 ? "—" : `${diff > 0 ? "−" : "+"}${formatMoney(Math.abs(diff))}`}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.minCases ?? "min"}</td>
                  <td className="px-4 py-3 text-ink/65">{windowLabel(row)}</td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => edit(row)} className="btn btn-outline btn-sm">
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(row.productId)}
                          aria-label={`Remove the agreed price for ${row.sku}`}
                          className="btn btn-outline btn-sm"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
