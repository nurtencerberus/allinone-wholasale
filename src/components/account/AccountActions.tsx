"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut, MailCheck } from "lucide-react";

export function AccountActions({ emailVerified }: { emailVerified: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const logout = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  const resend = async () => {
    setVerifying(true);
    setNote(null);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not resend.");
      if (data.alreadyVerified) {
        setNote("This email is already confirmed.");
      } else {
        setNote("Confirmation email sent.");
        if (data.devVerifyUrl) setDevLink(data.devVerifyUrl);
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not resend.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-2">
      {!emailVerified ? (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-3">
          <p className="text-[11px] font-bold text-ink">Email confirmation pending</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink/60">
            Double opt-in is required before ordering. Order updates and tracking are paused until confirmed.
          </p>
          <button onClick={resend} disabled={verifying} className="btn btn-primary btn-sm mt-2 w-full">
            {verifying ? <Loader2 size={12} className="animate-spin" /> : <MailCheck size={12} />}
            Resend confirmation
          </button>
          {note ? <p className="mt-2 text-[10px] text-ink/60">{note}</p> : null}
          {devLink ? (
            <a href={devLink} className="mt-1 block break-all text-[9.5px] font-medium text-ink underline">
              {devLink}
            </a>
          ) : null}
        </div>
      ) : null}
      <button onClick={logout} disabled={busy} className="btn btn-outline btn-sm w-full">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Sign out
      </button>
    </div>
  );
}
