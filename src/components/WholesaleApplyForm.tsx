"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, Loader2 } from "lucide-react";
import { SERVICE_STATES } from "@/lib/ship-to";

const BUSINESS_TYPES = [
  "Independent grocery",
  "Independent pharmacy",
  "Gym / studio / clinic",
  "Hospitality group",
  "Gift & home boutique",
  "Distributor / reseller",
  "Other retail",
];

const VOLUMES = ["Under $50k", "$50k – $250k", "$250k – $1M", "$1M+"];
const CATEGORY_OPTIONS = [
  "Vitamins & Supplements",
  "Pantry & Staples",
  "Home & Living",
];

const INITIAL = {
  companyName: "",
  ein: "",
  businessType: BUSINESS_TYPES[0],
  contactName: "",
  email: "",
  phone: "",
  website: "",
  addressLine1: "",
  city: "",
  state: "",
  zip: "",
  annualVolume: VOLUMES[1],
  notes: "",
};

export function WholesaleApplyForm({ account }: { account: { name: string; email: string; company: string | null } }) {
  const [values, setValues] = useState({
    ...INITIAL,
    contactName: account.name,
    email: account.email,
    companyName: account.company ?? "",
  });
  const [categories, setCategories] = useState<string[]>([CATEGORY_OPTIONS[0]]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<{ id?: number; message: string } | null>(null);

  const set = (key: keyof typeof INITIAL, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/wholesale/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, categories: categories.join(", ") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit the application.");
      setReference({ id: data.applicationId, message: data.message });
      window.scrollTo({ top: 200, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the application.");
    } finally {
      setBusy(false);
    }
  };

  if (reference) {
    return (
      <div className="card p-6">
        <span className="inline-flex rounded-full bg-fern/10 p-3 text-fern">
          <Check size={22} />
        </span>
        <h2 className="display mt-4 text-[28px]">Application received</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink/65">{reference.message}</p>
        <div className="mt-4 rounded-lg border border-ink/12 bg-parchment/40 p-4 text-[12px]">
          <p className="flex justify-between border-b border-ink/8 pb-2">
            <span className="text-ink/68">Reference</span>
            <span className="font-bold">#{String(reference.id ?? 0).padStart(4, "0")}</span>
          </p>
          <p className="flex justify-between border-b border-ink/8 py-2">
            <span className="text-ink/68">Company</span>
            <span className="font-semibold">{values.companyName}</span>
          </p>
          <p className="flex justify-between pt-2">
            <span className="text-ink/68">EIN on file</span>
            <span className="font-semibold">{values.ein}</span>
          </p>
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            "A trade specialist verifies your EIN against IRS records and your state resale certificate.",
            "You receive an approval email with your contract discount and tax-exemption status.",
            "Once approved, wholesale pricing, quick order and checkout unlock on this account.",
          ].map((step, index) => (
            <p key={step} className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-ink/65">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-cream">
                {index + 1}
              </span>
              {step}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shop" className="btn btn-primary btn-sm">Browse the catalog</Link>
          <Link href="/account" className="btn btn-outline btn-sm">Go to your account</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6">
      {error ? (
        <p role="alert" className="mb-4 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] font-medium text-clay">
          {error}
        </p>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="eyebrow">01 · Business identity</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="companyName">Legal company name *</label>
            <input
              id="companyName"
              className="field"
              required
              value={values.companyName}
              onChange={(event) => set("companyName", event.target.value)}
              placeholder="Sunrise Natural Grocers LLC"
            />
          </div>
          <div>
            <label className="label" htmlFor="ein">Federal EIN *</label>
            <input
              id="ein"
              className="field"
              required
              value={values.ein}
              onChange={(event) => set("ein", event.target.value)}
              placeholder="12-3456789"
              inputMode="numeric"
            />
            <p className="mt-1 text-[10px] text-ink/65">Verified against IRS records. Never shared.</p>
          </div>
          <div>
            <label className="label" htmlFor="businessType">Business type *</label>
            <select
              id="businessType"
              className="field"
              value={values.businessType}
              onChange={(event) => set("businessType", event.target.value)}
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="website">Website or storefront</label>
            <input
              id="website"
              className="field"
              value={values.website}
              onChange={(event) => set("website", event.target.value)}
              placeholder="https://sunrisenatural.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="annualVolume">Annual buying volume *</label>
            <select
              id="annualVolume"
              className="field"
              value={values.annualVolume}
              onChange={(event) => set("annualVolume", event.target.value)}
            >
              {VOLUMES.map((volume) => (
                <option key={volume}>{volume}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-6 space-y-3 border-t border-ink/10 pt-5">
        <legend className="eyebrow">02 · Buying contact</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contactName">Contact name *</label>
            <input
              id="contactName"
              className="field"
              required
              value={values.contactName}
              onChange={(event) => set("contactName", event.target.value)}
              placeholder="Priya Anand"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Business email *</label>
            <input
              id="email"
              type="email"
              className="field"
              required
              value={values.email}
              readOnly
              aria-describedby="email-note"
            />
            <p id="email-note" className="mt-1 text-[10px] text-ink/65">The confirmed email on your account.</p>
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone *</label>
            <input
              id="phone"
              className="field"
              required
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder="(720) 555-0177"
            />
          </div>
          <div>
            <label className="label" htmlFor="zip">ZIP code *</label>
            <input
              id="zip"
              className="field"
              required
              inputMode="numeric"
              maxLength={5}
              value={values.zip}
              onChange={(event) => set("zip", event.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="80205"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-6 space-y-3 border-t border-ink/10 pt-5">
        <legend className="eyebrow">03 · Ship-to address</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addressLine1">Street address *</label>
            <input
              id="addressLine1"
              className="field"
              required
              value={values.addressLine1}
              onChange={(event) => set("addressLine1", event.target.value)}
              placeholder="2210 Blake Street"
            />
          </div>
          <div>
            <label className="label" htmlFor="city">City *</label>
            <input
              id="city"
              className="field"
              required
              value={values.city}
              onChange={(event) => set("city", event.target.value)}
              placeholder="Denver"
            />
          </div>
          <div>
            <label className="label" htmlFor="state">State *</label>
            <select
              id="state"
              className="field"
              required
              value={values.state}
              onChange={(event) => set("state", event.target.value)}
            >
              <option value="">Select state</option>
              {SERVICE_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code} — {state.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-6 space-y-3 border-t border-ink/10 pt-5">
        <legend className="eyebrow">04 · Categories & notes</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((category) => {
            const active = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() =>
                  setCategories((current) =>
                    active ? current.filter((entry) => entry !== category) : [...current, category],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  active ? "border-ink bg-ink text-cream" : "border-ink/20 text-ink/72 hover:border-ink/50"
                }`}
              >
                {active ? <Check size={11} className="mr-1 inline" /> : null}
                {category}
              </button>
            );
          })}
        </div>
        <div>
          <label className="label" htmlFor="notes">Resale certificate & freight notes</label>
          <textarea
            id="notes"
            className="field min-h-[92px]"
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Resale certificate number, dock hours, liftgate requirements, target freight lanes…"
          />
        </div>
      </fieldset>

      <button type="submit" disabled={busy || categories.length === 0} className="btn btn-primary mt-6 w-full">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
        Submit trade application
        {!busy ? <ArrowRight size={15} /> : null}
      </button>
      <p className="mt-2.5 text-center text-[10px] leading-relaxed text-ink/65">
        No membership fee. Submitting an application does not create a purchasing obligation. EIN data is
        stored encrypted and used only for resale verification.
      </p>
    </form>
  );
}
