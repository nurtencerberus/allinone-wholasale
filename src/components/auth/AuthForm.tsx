"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, KeyRound, Loader2, Mail } from "lucide-react";
import { isStaffRole } from "@/lib/staff";

type Mode = "login" | "signup" | "forgot" | "reset" | "verify";

const COPY: Record<Mode, { eyebrow: string; title: string; sub: string; submit: string }> = {
  login: {
    eyebrow: "Trade portal",
    title: "Sign in",
    sub: "Case pricing, freight quotes and tax exemption follow your account.",
    submit: "Sign in",
  },
  signup: {
    eyebrow: "Create an account",
    title: "Open a trade login",
    sub: "Email confirmation is required before your first order. Wholesale pricing needs a separate EIN review.",
    submit: "Create account",
  },
  forgot: {
    eyebrow: "Password recovery",
    title: "Forgot your password?",
    sub: "We will send a single-use link that expires in 60 minutes.",
    submit: "Send reset link",
  },
  reset: {
    eyebrow: "Set a new password",
    title: "Choose a new password",
    sub: "All active sessions are signed out once the password changes.",
    submit: "Update password",
  },
  verify: {
    eyebrow: "Double opt-in",
    title: "Confirming your email",
    sub: "We are validating your single-use confirmation link.",
    submit: "Confirm email",
  },
};

export function AuthForm({
  mode,
  token,
  next,
  showDemo = false,
}: {
  mode: Mode;
  token?: string;
  next?: string;
  showDemo?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", company: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [codeStep, setCodeStep] = useState(false);
  const [code, setCode] = useState("");
  const copy = COPY[mode];

  const afterSignIn = (data: { user?: { role?: string } }) => {
    router.push(next || (isStaffRole(data.user?.role) ? "/admin" : "/account"));
    router.refresh();
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.restart) {
          setCodeStep(false);
          setCode("");
        }
        throw new Error(data.error ?? "Sign in failed.");
      }
      afterSignIn(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (mode !== "verify" || !token) return;
    setBusy(true);
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Verification failed.");
        setSuccess(`Email confirmed for ${data.email}. Your order updates now reach you.`);
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setBusy(false));
  }, [mode, token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    setDevLink(null);

    try {
      if (mode === "login") {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.email, password: values.password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Sign in failed.");
        if (data.twoFactorRequired) {
          setCodeStep(true);
          return;
        }
        afterSignIn(data);
        return;
      }

      if (mode === "signup") {
        if (values.password !== values.confirm) throw new Error("Passwords do not match.");
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            company: values.company,
            email: values.email,
            password: values.password,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Sign up failed.");
        setSuccess("Account created. Confirm your email to unlock order updates and verification.");
        if (data.devVerifyUrl) setDevLink(data.devVerifyUrl);
        router.refresh();
        return;
      }

      if (mode === "forgot") {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.email }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not send the link.");
        setSuccess(data.message ?? "If that email is on file, a reset link is on its way.");
        if (data.devResetUrl) setDevLink(data.devResetUrl);
        return;
      }

      if (mode === "reset") {
        if (!token) throw new Error("Reset token missing from the link.");
        if (values.password !== values.confirm) throw new Error("Passwords do not match.");
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: values.password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Reset failed.");
        setSuccess(`Password updated for ${data.email}. Sign in with your new password.`);
        return;
      }

      if (mode === "verify") {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Verification failed.");
        setSuccess(`Email confirmed for ${data.email}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  /** One-click demo access — fills and signs in without typing the password. */
  const fillDemo = async (email: string, password: string) => {
    setValues((current) => ({ ...current, email, password }));
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sign in failed.");
      if (data.twoFactorRequired) {
        setCodeStep(true);
        setBusy(false);
        return;
      }
      afterSignIn(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[420px]">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1 className="display mt-2 text-[34px] leading-tight">{copy.title}</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink/72">{copy.sub}</p>

      {success ? (
        <div className="mt-5 rounded-lg border border-fern/30 bg-fern/8 p-4">
          <p className="flex items-start gap-2 text-[12px] font-semibold text-fern">
            <Check size={15} className="mt-0.5 shrink-0" /> {success}
          </p>
          {devLink ? (
            <div className="mt-3 rounded-md border border-gold/40 bg-gold/10 p-3">
              <p className="text-[10px] font-bold tracking-wide text-ink/72 uppercase">
                Development delivery (no Resend key)
              </p>
              <a href={devLink} className="mt-1 block break-all text-[10.5px] font-medium text-ink underline">
                {devLink}
              </a>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={mode === "signup" ? "/account" : "/login"} className="btn btn-primary btn-sm">
              {mode === "signup" ? "Go to my account" : "Sign in"}
            </Link>
            {mode === "verify" ? (
              <Link href="/shop" className="btn btn-outline btn-sm">Browse catalog</Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] font-medium text-clay">
          {error}
        </p>
      ) : null}

      {codeStep ? (
        <form onSubmit={submitCode} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="code">Authentication code</label>
            <input
              id="code"
              className="field tracking-[0.2em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={20}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
            />
            <p className="mt-1.5 text-[11px] text-ink/68">
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
          </div>
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Verify and sign in
          </button>
        </form>
      ) : mode !== "verify" ? (
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" ? (
            <>
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input
                  id="name"
                  className="field"
                  autoComplete="name"
                  required
                  value={values.name}
                  onChange={(event) => setValues({ ...values, name: event.target.value })}
                  placeholder="Dana Whitfield"
                />
              </div>
              <div>
                <label className="label" htmlFor="company">Business name (optional)</label>
                <input
                  id="company"
                  className="field"
                  autoComplete="organization"
                  value={values.company}
                  onChange={(event) => setValues({ ...values, company: event.target.value })}
                  placeholder="Harbor House Pharmacy"
                />
              </div>
            </>
          ) : null}

          {mode !== "reset" ? (
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="field"
                autoComplete="email"
                required
                value={values.email}
                onChange={(event) => setValues({ ...values, email: event.target.value })}
                placeholder="buyer@yourstore.com"
              />
            </div>
          ) : null}

          {mode === "login" || mode === "signup" || mode === "reset" ? (
            <div>
              <label className="label" htmlFor="password">
                {mode === "reset" ? "New password" : "Password"}
              </label>
              <input
                id="password"
                type="password"
                className="field"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
                placeholder="At least 8 characters"
              />
            </div>
          ) : null}

          {mode === "signup" || mode === "reset" ? (
            <div>
              <label className="label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                className="field"
                autoComplete="new-password"
                required
                minLength={8}
                value={values.confirm}
                onChange={(event) => setValues({ ...values, confirm: event.target.value })}
                placeholder="Repeat password"
              />
            </div>
          ) : null}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? <Loader2 size={15} className="animate-spin" /> : mode === "forgot" ? <Mail size={15} /> : null}
            {copy.submit}
            {!busy ? <ArrowRight size={15} /> : null}
          </button>
        </form>
      ) : null}

      {mode === "login" && showDemo ? (
        <div className="mt-4 rounded-lg border border-dashed border-ink/20 bg-parchment/40 p-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-ink/65 uppercase">
            Demo accounts · click a row to sign in instantly
          </p>
          <div className="mt-2 space-y-1.5">
            <button
              type="button"
              onClick={() => fillDemo("buyer@harborhouse.com", "Trade123!")}
              className="block w-full text-left text-[11px] text-ink/70 hover:text-ink"
            >
              <span className="font-bold">Approved wholesale buyer</span> — buyer@harborhouse.com / Trade123!
              (8% pricing + ME tax exemption)
            </button>
            <button
              type="button"
              onClick={() => fillDemo("admin@meridiansupply.co", "Admin123!")}
              className="block w-full text-left text-[11px] text-ink/70 hover:text-ink"
            >
              <span className="font-bold">Admin portal</span> — admin@meridiansupply.co / Admin123!
            </button>
            <button
              type="button"
              onClick={() => fillDemo("customer@example.com", "Customer123!")}
              className="block w-full text-left text-[11px] text-ink/70 hover:text-ink"
            >
              <span className="font-bold">Retail customer</span> — customer@example.com / Customer123!
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink/68">
        {mode !== "login" ? (
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold underline">Already have an account?</Link>
        ) : null}
        {mode !== "signup" ? (
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-semibold underline">Create an account</Link>
        ) : null}
        {mode === "login" ? (
          <Link href="/forgot-password" className="underline">Forgot password?</Link>
        ) : null}
        <Link href="/wholesale/apply" className="underline">Apply for wholesale pricing</Link>
      </div>
    </div>
  );
}
