"use client";

import { useState } from "react";

export function AcceptInvite({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", token }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "That invitation could not be accepted.");
        return;
      }
      window.location.href = "/account/team";
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <p role="alert" className="mt-5 text-[12px] font-semibold text-clay">
        This link is missing its invitation code. Ask for a new invitation.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {error ? (
        <p role="alert" className="rounded-md border border-clay/40 bg-clay/10 px-4 py-2.5 text-[12px] font-semibold text-clay">
          {error}
        </p>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void accept()} className="btn btn-primary">
        {busy ? "Joining…" : "Accept and join"}
      </button>
    </div>
  );
}
