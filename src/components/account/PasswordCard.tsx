"use client";

import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not update the password.");
        return;
      }
      setNotice(data.message ?? "Done.");
      setCurrent("");
      setNext("");
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
        <KeyRound size={13} /> Password
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-clay/40 bg-clay/10 px-3 py-2 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-[12px] font-semibold text-fern">{notice}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Current password</span>
          <input
            aria-label="Current password"
            type="password"
            autoComplete="current-password"
            className="field"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input
            aria-label="New password"
            type="password"
            autoComplete="new-password"
            className="field"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-[10.5px] text-ink/65">
        At least {MIN_PASSWORD_LENGTH} characters, and not something built from your e-mail address. Changing it
        signs every other browser out.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !current || next.length < MIN_PASSWORD_LENGTH}
          onClick={() => void call({ action: "change", currentPassword: current, newPassword: next })}
          className="btn btn-primary btn-sm"
        >
          Change password
        </button>
        <button
          type="button"
          disabled={busy || !current}
          onClick={() => void call({ action: "sign-out-everywhere", currentPassword: current })}
          className="btn btn-outline btn-sm"
        >
          <LogOut size={13} /> Sign out everywhere else
        </button>
      </div>
    </div>
  );
}
