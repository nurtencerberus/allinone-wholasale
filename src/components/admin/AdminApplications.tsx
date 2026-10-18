"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Check, FileCheck2, Loader2, X } from "lucide-react";
import { formatDate } from "@/lib/money";

export type AdminApplication = {
  id: number;
  companyName: string;
  ein: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  website: string | null;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  annualVolume: string;
  categories: string;
  notes: string | null;
  status: string;
  rejectionReason: string | null;
  discountPct: number;
  taxExempt: boolean;
  verifiedEin: boolean;
  createdAt: string;
};

const STATUS_TABS = ["pending", "approved", "rejected"] as const;

export function AdminApplications({ applications }: { applications: AdminApplication[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("pending");
  const [selectedId, setSelectedId] = useState<number | null>(
    applications.find((entry) => entry.status === "pending")?.id ?? applications[0]?.id ?? null,
  );
  const [discount, setDiscount] = useState(8);
  const [taxExempt, setTaxExempt] = useState(true);
  const [verifyEin, setVerifyEin] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = applications.filter((entry) => entry.status === tab);
  const selected = applications.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/applications/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          discountPct: discount,
          taxExempt,
          verifyEin,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Review action failed.");
      setMessage(data.message ?? "Saved.");
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 bg-parchment/50 px-4 py-3">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Wholesale applications</p>
        <div className="flex gap-1.5">
          {STATUS_TABS.map((entry) => {
            const count = applications.filter((app) => app.status === entry).length;
            return (
              <button
                key={entry}
                onClick={() => setTab(entry)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize transition-colors ${
                  tab === entry ? "bg-ink text-cream" : "bg-white text-ink/55 hover:text-ink"
                }`}
              >
                {entry} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
        <ul className="divide-y divide-ink/8 border-b border-ink/10 lg:border-b-0 lg:border-r">
          {filtered.length === 0 ? (
            <li className="px-4 py-10 text-center text-[11.5px] text-ink/45">
              No {tab} applications.
            </li>
          ) : (
            filtered.map((app) => (
              <li key={app.id}>
                <button
                  onClick={() => {
                    setSelectedId(app.id);
                    setDiscount(app.status === "approved" ? app.discountPct : 8);
                    setTaxExempt(app.status === "approved" ? app.taxExempt : true);
                    setVerifyEin(true);
                    setMessage(null);
                    setError(null);
                  }}
                  className={`flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors ${
                    selected?.id === app.id ? "bg-fern/8" : "hover:bg-parchment/40"
                  }`}
                >
                  <div>
                    <p className="text-[12px] font-bold">{app.companyName}</p>
                    <p className="text-[10px] text-ink/45">
                      #{String(app.id).padStart(4, "0")} · {app.state} · {app.annualVolume}
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-ink/40">{formatDate(app.createdAt)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      app.status === "approved"
                        ? "bg-fern/15 text-fern"
                        : app.status === "rejected"
                          ? "bg-clay/15 text-clay"
                          : "bg-gold/20 text-[#7a5a1f]"
                    }`}
                  >
                    {app.status}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="p-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="display text-[22px] leading-tight">{selected.companyName}</h3>
                  <p className="mt-0.5 text-[10.5px] text-ink/50">
                    {selected.businessType} · {selected.annualVolume} · submitted {formatDate(selected.createdAt)}
                  </p>
                </div>
                <span className="chip">{selected.state}</span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-ink/10 bg-parchment/30 p-3 text-[11px]">
                {[
                  ["EIN", selected.ein],
                  ["Contact", selected.contactName],
                  ["Email", selected.email],
                  ["Phone", selected.phone],
                  ["Address", `${selected.addressLine1}, ${selected.city}, ${selected.state} ${selected.zip}`],
                  ["Categories", selected.categories],
                  ["Website", selected.website || "—"],
                  ["Status", selected.status],
                ].map(([label, value]) => (
                  <div key={label} className={label === "Address" || label === "Categories" ? "col-span-2" : ""}>
                    <dt className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">{label}</dt>
                    <dd className="font-medium text-ink/75">{value}</dd>
                  </div>
                ))}
              </dl>

              {selected.notes ? (
                <p className="mt-2.5 rounded-md border border-ink/10 bg-[#fffdf8] px-3 py-2 text-[11px] leading-relaxed text-ink/60">
                  <span className="font-bold text-ink/70">Applicant note: </span>
                  {selected.notes}
                </p>
              ) : null}

              {selected.rejectionReason ? (
                <p className="mt-2.5 flex items-start gap-2 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11px] text-clay">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {selected.rejectionReason}
                </p>
              ) : null}

              {selected.status === "pending" ? (
                <div className="mt-4 space-y-3">
                  <label className="flex items-start gap-2 rounded-md border border-fern/25 bg-fern/5 px-3 py-2.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={verifyEin}
                      onChange={(event) => setVerifyEin(event.target.checked)}
                      className="mt-0.5 accent-[#14241c]"
                    />
                    <span>
                      <strong className="font-bold">EIN verified</strong> against IRS records (format{" "}
                      {/^\d{2}-\d{7}$/.test(selected.ein) ? "valid" : "needs review"}) and resale certificate
                      matches {selected.state}.
                    </span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="discount">Contract discount %</label>
                      <input
                        id="discount"
                        type="number"
                        min={0}
                        max={40}
                        className="field"
                        value={discount}
                        onChange={(event) => setDiscount(Number(event.target.value))}
                      />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-[11px] text-ink/60">
                      <input
                        type="checkbox"
                        checked={taxExempt}
                        onChange={(event) => setTaxExempt(event.target.checked)}
                        className="accent-[#14241c]"
                      />
                      Apply resale tax exemption
                    </label>
                  </div>

                  <button onClick={() => act("approve")} disabled={busy !== null || !verifyEin} className="btn btn-primary w-full">
                    {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                    Approve & define tax exemption
                  </button>

                  <div className="rounded-lg border border-ink/12 p-3">
                    <label className="label" htmlFor="reason">Reject with a reason</label>
                    <textarea
                      id="reason"
                      className="field min-h-[64px]"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="EIN could not be matched; resale certificate expired…"
                    />
                    <button
                      onClick={() => act("reject")}
                      disabled={busy !== null || reason.trim().length < 5}
                      className="btn btn-sm mt-2 w-full border border-clay/40 text-clay hover:bg-clay/10"
                    >
                      {busy === "reject" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                      Reject application
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-fern/8 px-3 py-2 text-[11px] text-fern">
                  <p className="flex items-center gap-1.5 font-bold">
                    <Check size={12} /> Reviewed
                  </p>
                  <p className="mt-0.5">
                    {selected.status === "approved"
                      ? `${selected.discountPct}% account pricing${selected.taxExempt ? " · resale tax exemption" : ""}`
                      : selected.rejectionReason}
                  </p>
                </div>
              )}

              {message ? (
                <p className="mt-2.5 rounded-md border border-fern/30 bg-fern/8 px-3 py-2 text-[11px] font-medium text-fern">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="mt-2.5 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11px] text-clay">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-ink/40">
              <FileCheck2 size={22} />
              <p className="text-[11.5px]">Select an application to review.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
