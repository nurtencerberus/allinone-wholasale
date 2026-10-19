"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { SERVICE_STATES } from "@/lib/ship-to";

type AddressRow = {
  id: number;
  label: string;
  name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  isDefault: boolean;
};

const EMPTY = {
  label: "",
  name: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  isDefault: false,
};

export function AddressManager({ initial }: { initial: AddressRow[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [values, setValues] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the address.");
      setList((current) => [
        ...current.map((entry) => (values.isDefault ? { ...entry, isDefault: false } : entry)),
        data.address as AddressRow,
      ]);
      setValues(EMPTY);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the address.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setList((current) => current.filter((entry) => entry.id !== id));
    await fetch(`/api/account/addresses?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center">
            <MapPin size={24} className="text-ink/25" />
            <p className="text-[12.5px] font-bold">No saved addresses</p>
            <p className="text-[11px] text-ink/50">Add a receiving dock to speed up LTL scheduling.</p>
          </div>
        ) : (
          list.map((entry) => (
            <div key={entry.id} className="card flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-[11px] font-bold">
                  {entry.label}
                  {entry.isDefault ? <span className="ml-1.5 text-[9px] font-semibold text-fern">DEFAULT</span> : null}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink/60">
                  {entry.name}
                  {entry.company ? ` · ${entry.company}` : ""}
                  <br />
                  {entry.line1}
                  {entry.line2 ? `, ${entry.line2}` : ""}
                  <br />
                  {entry.city}, {entry.state} {entry.zip}
                  {entry.phone ? <><br />{entry.phone}</> : null}
                </p>
              </div>
              <button
                onClick={() => remove(entry.id)}
                aria-label={`Remove ${entry.label}`}
                className="rounded p-1.5 text-ink/30 hover:bg-clay/10 hover:text-clay"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={add} className="card p-5">
        <p className="flex items-center gap-2 text-[12px] font-bold">
          <Plus size={14} /> Add a receiving address
        </p>
        {error ? (
          <p className="mt-2 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11px] text-clay">{error}</p>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="label">Label *</label>
            <input
              id="label"
              className="field"
              required
              value={values.label}
              onChange={(event) => setValues({ ...values, label: event.target.value })}
              placeholder="Main store · receiving"
            />
          </div>
          <div>
            <label className="label" htmlFor="a-name">Contact *</label>
            <input
              id="a-name"
              className="field"
              required
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
              placeholder="Dana Whitfield"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-company">Company</label>
            <input
              id="a-company"
              className="field"
              value={values.company}
              onChange={(event) => setValues({ ...values, company: event.target.value })}
              placeholder="Harbor House Pharmacy"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-line1">Street *</label>
            <input
              id="a-line1"
              className="field"
              required
              value={values.line1}
              onChange={(event) => setValues({ ...values, line1: event.target.value })}
              placeholder="88 Exchange Street"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-line2">Suite / dock</label>
            <input
              id="a-line2"
              className="field"
              value={values.line2}
              onChange={(event) => setValues({ ...values, line2: event.target.value })}
              placeholder="Bay 3"
            />
          </div>
          <div>
            <label className="label" htmlFor="a-city">City *</label>
            <input
              id="a-city"
              className="field"
              required
              value={values.city}
              onChange={(event) => setValues({ ...values, city: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="a-state">State *</label>
              <select
                id="a-state"
                className="field"
                required
                value={values.state}
                onChange={(event) => setValues({ ...values, state: event.target.value })}
              >
                <option value="">—</option>
                {SERVICE_STATES.map((state) => (
                  <option key={state.code} value={state.code}>{state.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-zip">ZIP *</label>
              <input
                id="a-zip"
                className="field"
                required
                inputMode="numeric"
                maxLength={5}
                value={values.zip}
                onChange={(event) => setValues({ ...values, zip: event.target.value.replace(/\D/g, "").slice(0, 5) })}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-phone">Freight phone</label>
            <input
              id="a-phone"
              className="field"
              value={values.phone}
              onChange={(event) => setValues({ ...values, phone: event.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-ink/60 sm:col-span-2">
            <input
              type="checkbox"
              checked={values.isDefault}
              onChange={(event) => setValues({ ...values, isDefault: event.target.checked })}
              className="accent-[#14241c]"
            />
            Set as default delivery address
          </label>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary mt-4 w-full">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save address
        </button>
      </form>
    </div>
  );
}
