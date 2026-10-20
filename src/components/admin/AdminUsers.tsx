"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Check, Loader2, Percent, RefreshCw, Search, ShieldCheck, ShieldOff, Tag, UserCog } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/money";
import { ROLE_LABELS, ROLES } from "@/lib/staff";

export type AdminAccount = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  role: string;
  accountTier: string;
  wholesaleDiscountPct: number;
  taxExempt: boolean;
  taxExemptState: string | null;
  taxExemptCertNumber: string | null;
  ein: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  orderCount: number;
  totalSpend: number;
  lastOrderAt: string | null;
  applicationStatus: string | null;
  isSelf: boolean;
};

export type AdminAccountTotals = {
  accounts: number;
  wholesale: number;
  unverified: number;
  taxExempt: number;
  revenue: number;
  guestOrders: number;
};

const TIER_STYLE: Record<string, string> = {
  wholesale: "bg-fern/15 text-fern",
  retail: "bg-ink/8 text-ink/70",
};

export function AdminUsers({
  initialAccounts,
  totals,
  canManageAccounts,
  canManageStaff,
}: {
  initialAccounts: AdminAccount[];
  totals: AdminAccountTotals;
  canManageAccounts: boolean;
  canManageStaff: boolean;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { discount: number; exempt: boolean; role: string; tier: string }>>(
    Object.fromEntries(
      initialAccounts.map((account) => [
        account.id,
        {
          discount: account.wholesaleDiscountPct,
          exempt: account.taxExempt,
          role: account.role,
          tier: account.accountTier,
        },
      ]),
    ),
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      [account.name, account.email, account.company ?? "", account.ein ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [accounts, query]);

  const save = async (account: AdminAccount, extra: Record<string, unknown> = {}) => {
    const draft = drafts[account.id];
    // Send only what changed: each field group needs its own permission on the server.
    const changes: Record<string, unknown> = { ...extra };
    if (draft.discount !== account.wholesaleDiscountPct) changes.discountPct = draft.discount;
    if (draft.exempt !== account.taxExempt) changes.taxExempt = draft.exempt;
    if (draft.tier !== account.accountTier) changes.accountTier = draft.tier;
    if (draft.role !== account.role) changes.role = draft.role;
    if (Object.keys(changes).length === 0) return;
    if (changes.taxExempt === true && !account.taxExemptCertNumber) {
      const number = window.prompt(`Resale certificate number for ${account.company ?? account.email} (NJ ST-3 / ST-3NR):`);
      if (!number?.trim()) return;
      changes.taxExemptCertNumber = number.trim();
      changes.taxExemptState = "NJ";
    }
    if (changes.role !== undefined || changes.resetTwoFactor) {
      const password = window.prompt("Staff access change — enter your own password to confirm:");
      if (!password) return;
      changes.currentPassword = password;
    }
    setBusyId(account.id);
    setError(null);
    setSavedId(null);
    try {
      const response = await fetch(`/api/admin/users/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the account.");
      const updated = data.account as AdminAccount;
      setAccounts((current) =>
        current.map((entry) => (entry.id === account.id ? { ...entry, ...updated } : entry)),
      );
      setSavedId(account.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the account.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-parchment/50 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase">
            <UserCog size={13} /> Account management
          </p>
          <p className="mt-0.5 text-[10px] text-ink/65">
            {totals.accounts} accounts · {totals.wholesale} wholesale · {totals.unverified} awaiting email
            confirmation · {totals.taxExempt} tax-exempt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/50" />
            <input aria-label="Search accounts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, EIN…"
              className="w-[210px] rounded-full border border-ink/15 bg-white py-1.5 pl-7 pr-3 text-[11px] focus:border-ink/40 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setQuery("")}
            className="rounded-full border border-ink/15 p-1.5 text-ink/68 hover:text-ink"
            aria-label="Clear search"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-b border-clay/20 bg-clay/10 px-4 py-2 text-[11px] text-clay">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-left text-[11px]">
          <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/65 uppercase">
            <tr className="border-b border-ink/8">
              <th scope="col" className="px-4 py-2.5">Account</th>
              <th scope="col" className="px-2 py-2.5">Tier</th>
              <th scope="col" className="px-2 py-2.5 text-center">Contract %</th>
              <th scope="col" className="px-2 py-2.5">Tax exemption</th>
              <th scope="col" className="px-2 py-2.5">Role</th>
              <th scope="col" className="px-2 py-2.5">Orders</th>
              <th scope="col" className="px-2 py-2.5 text-right">Lifetime</th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((account) => {
              const draft = drafts[account.id] ?? {
                discount: account.wholesaleDiscountPct,
                exempt: account.taxExempt,
                role: account.role,
                tier: account.accountTier,
              };
              return (
                <tr key={account.id} className="border-b border-ink/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-bold">
                      {account.name}
                      {account.isSelf ? (
                        <span className="rounded-full bg-ink px-1.5 py-0.5 text-[8px] font-bold text-cream uppercase">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-ink/68">{account.email}</p>
                    <p className="text-[9.5px] text-ink/65">
                      {account.company ?? "No company"}
                      {account.ein ? ` · EIN ${account.ein}` : ""}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink/65">
                      <span>Joined {formatDate(account.createdAt)}</span>
                      {account.lastOrderAt ? (
                        <>
                          <span className="text-ink/20">·</span>
                          <span>Last order {formatDate(account.lastOrderAt)}</span>
                        </>
                      ) : null}
                    </p>
                  </td>

                  <td className="px-2 py-3">
                    <select aria-label="Account tier"
                      value={draft.tier}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [account.id]: { ...draft, tier: event.target.value } })
                      }
                      className={`rounded-full px-2 py-1 text-[9.5px] font-bold uppercase ${TIER_STYLE[draft.tier] ?? ""}`}
                    >
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                    </select>
                    {account.applicationStatus ? (
                      <p className="mt-1 text-[9px] text-ink/65">
                        App: <span className="capitalize">{account.applicationStatus}</span>
                      </p>
                    ) : null}
                  </td>

                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      <input aria-label="Contract discount percent"
                        type="number"
                        min={0}
                        max={40}
                        value={draft.discount}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [account.id]: { ...draft, discount: Number(event.target.value) },
                          })
                        }
                        className="w-14 rounded border border-ink/20 bg-white px-1.5 py-1 text-[10.5px]"
                      />
                      <Percent size={11} className="text-ink/50" />
                    </div>
                  </td>

                  <td className="px-2 py-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-ink/65">
                      <input
                        type="checkbox"
                        checked={draft.exempt}
                        onChange={(event) =>
                          setDrafts({ ...drafts, [account.id]: { ...draft, exempt: event.target.checked } })
                        }
                        className="accent-[#14241c]"
                      />
                      {draft.exempt ? (
                        <span className="flex items-center gap-1 text-fern">
                          <ShieldCheck size={11} /> {account.taxExemptState ?? "NJ"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <ShieldOff size={11} /> Taxed
                        </span>
                      )}
                    </label>
                  </td>

                  <td className="px-2 py-3">
                    <select aria-label="Staff role"
                      value={draft.role}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [account.id]: { ...draft, role: event.target.value } })
                      }
                      disabled={account.isSelf || !canManageStaff}
                      className="rounded border border-ink/20 bg-white px-1.5 py-1 text-[10px] disabled:opacity-50"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    {account.role !== "customer" ? (
                      <p className={`mt-1 text-[9px] font-semibold ${account.twoFactorEnabled ? "text-fern" : "text-clay"}`}>
                        2FA {account.twoFactorEnabled ? "on" : "not set up"}
                        {account.twoFactorEnabled && canManageStaff && !account.isSelf ? (
                          <button
                            type="button"
                            onClick={() => save(account, { resetTwoFactor: true })}
                            className="ml-1.5 text-ink/68 underline hover:text-ink"
                          >
                            reset
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    <button
                      onClick={() => save(account, { verifyEmail: true })}
                      disabled={!account.emailVerified || busyId === account.id}
                      className="mt-1 flex items-center gap-1 text-[9.5px] font-semibold text-fern hover:underline disabled:text-ink/25 disabled:no-underline"
                    >
                      {account.emailVerified ? <BadgeCheck size={10} /> : <Check size={10} />}
                      {account.emailVerified ? "Verified" : "Mark verified"}
                    </button>
                  </td>

                  <td className="px-2 py-3">
                    <p className="font-bold tabular-nums">{account.orderCount}</p>
                    <p className="text-[9px] text-ink/65">orders</p>
                  </td>

                  <td className="px-2 py-3 text-right">
                    <p className="font-bold tabular-nums">{formatMoney(account.totalSpend)}</p>
                    <p className="text-[9px] text-ink/65">
                      {account.orderCount
                        ? `${formatMoney(Math.round(account.totalSpend / account.orderCount))} avg`
                        : "no orders"}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {account.accountTier === "wholesale" ? (
                        <Link
                          href={`/admin/accounts/${account.id}/prices`}
                          className="btn btn-outline btn-sm whitespace-nowrap"
                          title="Agreed prices for this account"
                        >
                          <Tag size={11} /> Prices
                        </Link>
                      ) : null}
                    <button
                      onClick={() => save(account)}
                      disabled={busyId === account.id || (!canManageAccounts && !canManageStaff)}
                      className="btn btn-primary btn-sm whitespace-nowrap"
                    >
                      {busyId === account.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : savedId === account.id ? (
                        <Check size={11} />
                      ) : null}
                      Save
                    </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[11.5px] text-ink/65">
                  No accounts match “{query}”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 bg-parchment/30 px-4 py-2.5 text-[10px] text-ink/65">
        <p>
          Contract pricing and tax exemption are re-applied server-side on every quote — a change here
          affects the next cart immediately.
        </p>
        <p>
          Guest orders: {totals.guestOrders} · Revenue tracked: {formatMoney(totals.revenue)}
        </p>
      </div>
    </div>
  );
}
