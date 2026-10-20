"use client";

import { useState } from "react";
import { Pause, Play, Plus, Save, X } from "lucide-react";
import { ACCOUNT_TIERS } from "@/lib/access";
import { COUPON_KINDS } from "@/lib/coupon-input";
import { formatMoney } from "@/lib/money";

export type AdminCoupon = {
  id: number;
  code: string;
  kind: string;
  value: number;
  minSubtotal: number;
  description: string;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  allowedTiers: string[];
  stackable: boolean;
  redeemed: number;
  discounted: number;
};

type FormState = {
  id: number | null;
  code: string;
  kind: string;
  /** Percent for "percent", dollars for "fixed" — the API turns dollars into cents. */
  value: string;
  minSubtotal: string;
  description: string;
  startsAt: string;
  expiresAt: string;
  maxRedemptions: string;
  perCustomerLimit: string;
  allowedTiers: string[];
  stackable: boolean;
  active: boolean;
};

const BLANK: FormState = {
  id: null,
  code: "",
  kind: "percent",
  value: "10",
  minSubtotal: "0",
  description: "",
  startsAt: "",
  expiresAt: "",
  maxRedemptions: "",
  perCustomerLimit: "",
  allowedTiers: [],
  stackable: true,
  active: true,
};

/** An ISO timestamp as the value a datetime-local input expects, in the viewer's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function describeValue(coupon: AdminCoupon): string {
  if (coupon.kind === "percent") return `${coupon.value}% off`;
  if (coupon.kind === "fixed") return `${formatMoney(coupon.value)} off`;
  return "Free ground freight";
}

function describeWindow(coupon: AdminCoupon): string {
  const from = coupon.startsAt ? new Date(coupon.startsAt).toLocaleDateString() : null;
  const to = coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "Always";
}

export function AdminCoupons({ coupons, canEdit }: { coupons: AdminCoupon[]; canEdit: boolean }) {
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const edit = (coupon: AdminCoupon) =>
    setForm({
      id: coupon.id,
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.kind === "fixed" ? (coupon.value / 100).toFixed(2) : String(coupon.value),
      minSubtotal: (coupon.minSubtotal / 100).toFixed(2),
      description: coupon.description,
      startsAt: toLocalInput(coupon.startsAt),
      expiresAt: toLocalInput(coupon.expiresAt),
      maxRedemptions: coupon.maxRedemptions === null ? "" : String(coupon.maxRedemptions),
      perCustomerLimit: coupon.perCustomerLimit === null ? "" : String(coupon.perCustomerLimit),
      allowedTiers: coupon.allowedTiers,
      stackable: coupon.stackable,
      active: coupon.active,
    });

  const send = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/coupons", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save the coupon.");
        return;
      }
      setNotice(data.message ?? "Saved.");
      setForm(null);
      window.location.reload();
    } catch {
      setError("Network error — the coupon was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!form) return;
    void send(form.id ? "PATCH" : "POST", {
      id: form.id ?? undefined,
      code: form.code,
      kind: form.kind,
      value: Number(form.value),
      minSubtotal: Number(form.minSubtotal || 0),
      description: form.description,
      startsAt: form.startsAt,
      expiresAt: form.expiresAt,
      maxRedemptions: form.maxRedemptions,
      perCustomerLimit: form.perCustomerLimit,
      allowedTiers: form.allowedTiers,
      stackable: form.stackable,
      active: form.active,
    });
  };

  return (
    <div className="space-y-5">
      {error ? <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">{error}</p> : null}
      {notice ? <p className="rounded-md border border-fern/40 bg-fern/10 px-4 py-2.5 text-[12px] font-semibold text-fern">{notice}</p> : null}

      {canEdit ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setForm(form ? null : BLANK)} className="btn btn-primary btn-sm">
            {form ? <X size={14} /> : <Plus size={14} />} {form ? "Close" : "New coupon"}
          </button>
        </div>
      ) : null}

      {form ? (
        <div className="card p-5">
          <p className="eyebrow">{form.id ? `Edit ${form.code}` : "New coupon"}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="label">Code</span>
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                className="field"
                placeholder="SPRING10"
              />
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="field">
                {COUPON_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === "percent" ? "Percentage off" : kind === "fixed" ? "Fixed amount off" : "Free ground freight"}
                  </option>
                ))}
              </select>
            </label>
            {form.kind === "shipping" ? null : (
              <label className="block">
                <span className="label">{form.kind === "percent" ? "Percent (1–100)" : "Amount ($)"}</span>
                <input value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} className="field" inputMode="decimal" />
              </label>
            )}
            <label className="block">
              <span className="label">Minimum subtotal ($)</span>
              <input
                value={form.minSubtotal}
                onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })}
                className="field"
                inputMode="decimal"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Description shown to the buyer</span>
              <input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="field"
                placeholder="10% off your spring restock"
              />
            </label>
            <label className="block">
              <span className="label">Starts (optional)</span>
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="field" />
            </label>
            <label className="block">
              <span className="label">Ends (optional)</span>
              <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className="field" />
            </label>
            <label className="block">
              <span className="label">Total redemptions (blank = unlimited)</span>
              <input
                value={form.maxRedemptions}
                onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })}
                className="field"
                inputMode="numeric"
              />
            </label>
            <label className="block">
              <span className="label">Per customer (blank = unlimited)</span>
              <input
                value={form.perCustomerLimit}
                onChange={(event) => setForm({ ...form, perCustomerLimit: event.target.value })}
                className="field"
                inputMode="numeric"
              />
            </label>
            <div>
              <span className="label">Account tiers (none = all)</span>
              <div className="mt-1.5 flex gap-3">
                {ACCOUNT_TIERS.map((tier) => (
                  <label key={tier} className="flex items-center gap-1.5 text-[11.5px] font-medium capitalize">
                    <input
                      type="checkbox"
                      checked={form.allowedTiers.includes(tier)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          allowedTiers: event.target.checked
                            ? [...form.allowedTiers, tier]
                            : form.allowedTiers.filter((entry) => entry !== tier),
                        })
                      }
                    />
                    {tier}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11.5px] font-medium">
              <input type="checkbox" checked={form.stackable} onChange={(event) => setForm({ ...form, stackable: event.target.checked })} />
              May be combined with contract pricing
            </label>
            <label className="flex items-center gap-2 text-[11.5px] font-medium">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Active
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="btn btn-outline btn-sm">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">
              <Save size={14} /> {busy ? "Saving…" : "Save coupon"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[11.5px]">
          <thead className="border-b border-ink/10 bg-parchment/50 text-[10px] font-bold tracking-[0.12em] uppercase text-ink/70">
            <tr>
              <th scope="col" className="px-4 py-2.5">Code</th>
              <th scope="col" className="px-4 py-2.5">Offer</th>
              <th scope="col" className="px-4 py-2.5">Window</th>
              <th scope="col" className="px-4 py-2.5">Rules</th>
              <th scope="col" className="px-4 py-2.5 text-right">Used</th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink/68">
                  No coupons yet.
                </td>
              </tr>
            ) : null}
            {coupons.map((coupon) => (
              <tr key={coupon.id} className={coupon.active ? undefined : "opacity-55"}>
                <td className="px-4 py-3">
                  <p className="font-bold">{coupon.code}</p>
                  <p className="text-[10.5px] text-ink/68">{coupon.description}</p>
                </td>
                <td className="px-4 py-3">
                  {describeValue(coupon)}
                  {coupon.minSubtotal > 0 ? <p className="text-[10.5px] text-ink/68">min {formatMoney(coupon.minSubtotal)}</p> : null}
                </td>
                <td className="px-4 py-3">{describeWindow(coupon)}</td>
                <td className="px-4 py-3 text-[10.5px] text-ink/72">
                  <p>{coupon.allowedTiers.length ? coupon.allowedTiers.join(", ") : "all tiers"}</p>
                  <p>
                    {coupon.perCustomerLimit === null ? "no per-customer limit" : `${coupon.perCustomerLimit} per customer`}
                    {coupon.stackable ? "" : " · not stackable"}
                  </p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {coupon.redeemed}
                  {coupon.maxRedemptions === null ? "" : ` / ${coupon.maxRedemptions}`}
                  <p className="text-[10.5px] text-ink/68">{formatMoney(coupon.discounted)} given</p>
                </td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => edit(coupon)} className="btn btn-outline btn-sm">
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send("PATCH", { id: coupon.id, active: !coupon.active })}
                        className="btn btn-outline btn-sm"
                      >
                        {coupon.active ? <Pause size={13} /> : <Play size={13} />}
                        {coupon.active ? "Pause" : "Resume"}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
