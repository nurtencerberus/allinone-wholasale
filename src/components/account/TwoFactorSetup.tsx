"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";

type SetupData = { secret: string; uri: string; qrSvg: string };

async function call(body: Record<string, unknown>) {
  const response = await fetch("/api/account/two-factor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

export function TwoFactorSetup({
  initiallyEnabled,
  mustStayOn,
  continueTo,
}: {
  initiallyEnabled: boolean;
  mustStayOn: boolean;
  continueTo: string;
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <div className="card p-5">
        <p className="flex items-center gap-2 text-[13px] font-bold text-fern">
          <ShieldCheck size={16} /> Save your recovery codes
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink/72">
          Each code signs you in once if you lose your phone. They are shown only now — store them in a password
          manager or print them.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-[13px]" data-testid="recovery-codes">
          {codes.map((entry) => (
            <li key={entry} className="rounded border border-ink/10 bg-parchment/50 px-2.5 py-1.5 text-center">
              {entry}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
          </button>
          <Link href={continueTo} className="btn btn-primary btn-sm">I saved them — continue</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {error ? (
        <p role="alert" className="mb-4 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] font-medium text-clay">{error}</p>
      ) : null}

      {enabled ? (
        <>
          <p className="flex items-center gap-2 text-[13px] font-bold text-fern">
            <ShieldCheck size={16} /> Two-factor sign-in is on
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="tf-code">Current code (or a recovery code)</label>
              <input id="tf-code" className="field" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !code}
                className="btn btn-outline btn-sm"
                onClick={() =>
                  run(async () => {
                    const data = await call({ action: "recovery-codes", code });
                    setCode("");
                    setCodes(data.recoveryCodes);
                  })
                }
              >
                <KeyRound size={13} /> New recovery codes
              </button>
            </div>
            {mustStayOn ? (
              <p className="text-[11px] text-ink/68">Staff accounts cannot turn two-factor sign-in off. An owner can reset it from the admin users screen.</p>
            ) : (
              <div className="border-t border-ink/10 pt-3">
                <label className="label" htmlFor="tf-password">Password, to turn it off</label>
                <input id="tf-password" type="password" className="field" value={password} onChange={(event) => setPassword(event.target.value)} />
                <button
                  type="button"
                  disabled={busy || !code || !password}
                  className="btn btn-outline btn-sm mt-2"
                  onClick={() =>
                    run(async () => {
                      await call({ action: "disable", code, password });
                      setEnabled(false);
                      setCode("");
                      setPassword("");
                    })
                  }
                >
                  Turn off two-factor sign-in
                </button>
              </div>
            )}
          </div>
        </>
      ) : setup ? (
        <>
          <p className="text-[13px] font-bold">1. Scan this code with your authenticator app</p>
          <div className="mt-3 flex flex-wrap items-start gap-5">
            <div
              className="rounded-lg border border-ink/10 bg-white p-2"
              aria-label="QR code for your authenticator app"
              role="img"
              dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            />
            <div className="min-w-0 flex-1 text-[11.5px] text-ink/72">
              <p>Can&apos;t scan? Enter this key manually (time-based):</p>
              <p className="mt-1 font-mono text-[13px] break-all text-ink" data-testid="totp-secret">{setup.secret}</p>
            </div>
          </div>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const data = await call({ action: "confirm", code });
                setEnabled(true);
                setCode("");
                setCodes(data.recoveryCodes);
              });
            }}
          >
            <label className="label" htmlFor="tf-confirm">2. Enter the 6-digit code it shows</label>
            <div className="flex gap-2">
              <input
                id="tf-confirm"
                className="field max-w-[160px] tracking-[0.2em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
                {busy ? <Loader2 size={13} className="animate-spin" /> : null} Turn on
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="text-[13px] font-bold">Two-factor sign-in is off</p>
          <button
            type="button"
            disabled={busy}
            className="btn btn-primary btn-sm mt-3"
            onClick={() =>
              run(async () => {
                setSetup(await call({ action: "start" }));
              })
            }
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Set up two-factor sign-in
          </button>
        </>
      )}
    </div>
  );
}
