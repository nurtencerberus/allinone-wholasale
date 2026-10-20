"use client";

import { useState } from "react";
import { Building2, Mail, Trash2, UserPlus } from "lucide-react";
import type { Member, PendingInvite } from "@/lib/companies";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner · manages the team and terms",
  buyer: "Buyer · can place orders",
  viewer: "Viewer · read-only",
};

export function CompanyTeam({
  company,
  members,
  invites,
  viewerId,
  canManage,
  defaultName,
}: {
  company: { id: number; name: string } | null;
  members: Member[];
  invites: PendingInvite[];
  viewerId: number;
  canManage: boolean;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("buyer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>, reload = true) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; message?: string; inviteUrl?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not update the account.");
        return;
      }
      if (data.inviteUrl) {
        setNotice(`${data.message} Demo link: ${data.inviteUrl}`);
        return;
      }
      setNotice(data.message ?? "Done.");
      if (reload) window.location.reload();
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  if (!company) {
    return (
      <div className="card max-w-xl p-6">
        {error ? <p role="alert" className="mb-3 text-[12px] font-semibold text-clay">{error}</p> : null}
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
          <Building2 size={13} /> Create a company account
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink/72">
          Your current terms and agreed prices carry over unchanged. You become the owner and can invite
          colleagues as buyers or read-only viewers.
        </p>
        <label className="mt-4 block">
          <span className="label">Company name</span>
          <input
            aria-label="Company name"
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Harbor House Provisions"
          />
        </label>
        <button
          type="button"
          disabled={busy || name.trim().length < 2}
          onClick={() => void call({ action: "create", name })}
          className="btn btn-primary btn-sm mt-4"
        >
          Create the account
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-fern/40 bg-fern/10 px-4 py-2.5 text-[12px] font-semibold text-fern">{notice}</p>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[11.5px]">
          <thead className="border-b border-ink/10 bg-parchment/50 text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">
            <tr>
              <th scope="col" className="px-4 py-2.5">Member</th>
              <th scope="col" className="px-4 py-2.5">Role</th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {member.name}
                    {member.id === viewerId ? <span className="ml-1.5 text-[10px] text-ink/65">(you)</span> : null}
                  </p>
                  <p className="text-[10.5px] text-ink/65">
                    {member.email}
                    {member.emailVerified ? "" : " · e-mail not verified"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {canManage && member.id !== viewerId ? (
                    <select
                      aria-label={`Role for ${member.email}`}
                      className="field w-44"
                      value={member.companyRole ?? "buyer"}
                      disabled={busy}
                      onChange={(event) => void call({ action: "set-role", memberId: member.id, role: event.target.value })}
                    >
                      {Object.keys(ROLE_LABELS).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-ink/72">{ROLE_LABELS[member.companyRole ?? "buyer"]}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && member.id !== viewerId ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${member.email} from the account`}
                      onClick={() => void call({ action: "remove", memberId: member.id })}
                      className="btn btn-outline btn-sm"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length ? (
        <div className="card p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            <Mail size={13} /> Waiting to accept
          </p>
          <ul className="mt-2 space-y-1 text-[11.5px] text-ink/72">
            {invites.map((invite) => (
              <li key={invite.id}>
                {invite.email} · {invite.companyRole} · expires {new Date(invite.expiresAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <div className="card p-5">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            <UserPlus size={13} /> Invite a colleague
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label">Work e-mail</span>
              <input
                aria-label="Colleague's work e-mail"
                className="field w-72"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="buyer@harborhouse.com"
              />
            </label>
            <label className="block">
              <span className="label">Role</span>
              <select aria-label="Role for the invitation" className="field w-40" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="buyer">buyer</option>
                <option value="viewer">viewer</option>
                <option value="owner">owner</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !email.includes("@")}
              onClick={() => void call({ action: "invite", email, role }, false)}
              className="btn btn-primary btn-sm"
            >
              Send invitation
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-ink/65">
            The link works for 14 days and only for the address it was sent to.
          </p>
        </div>
      ) : null}
    </div>
  );
}
