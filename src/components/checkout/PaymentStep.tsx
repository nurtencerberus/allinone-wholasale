"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { StripePaymentPanel } from "@/components/checkout/StripePaymentPanel";
import type { SessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export type PaymentMethod = "card" | "net30" | "ach";

export type PlaceOrderInput = {
  method: PaymentMethod;
  paymentRef: string | null;
  poNumber?: string;
};

type Intent = {
  mode: "stripe" | "demo" | "unavailable";
  clientSecret: string | null;
  publishableKey: string | null;
} | null;

/**
 * Stripe's documented test card numbers. The demo form accepts nothing else, so a
 * real card number typed here is rejected in the browser and never leaves it.
 */
const TEST_CARDS = {
  visa: { label: "Visa test (pass)", number: "4242 4242 4242 4242", cvc: "345", brand: "VISA" },
  mastercard: { label: "Mastercard test (pass)", number: "5555 5555 5555 4444", cvc: "345", brand: "MC" },
  amex: { label: "Amex test (pass)", number: "3782 822463 10005", cvc: "3456", brand: "AMEX" },
  declined: { label: "Declined card", number: "4000 0000 0000 0002", cvc: "345", brand: "VISA" },
} as const;

type TestCardKey = keyof typeof TEST_CARDS;

const digits = (value: string) => value.replace(/\D/g, "");

function formatCardNumber(value: string): string {
  const raw = digits(value).slice(0, 16);
  if (/^3[47]/.test(raw)) {
    return [raw.slice(0, 4), raw.slice(4, 10), raw.slice(10, 15)].filter(Boolean).join(" ");
  }
  return raw.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string): string {
  const raw = digits(value).slice(0, 4);
  return raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
}

function brandOf(number: string): string {
  const raw = digits(number);
  if (/^4/.test(raw)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(raw)) return "MC";
  if (/^3[47]/.test(raw)) return "AMEX";
  return "";
}

function expiryError(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return "Enter the expiry as MM/YY.";
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return "Expiry month must be 01–12.";
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return "This test card has expired.";
  }
  return null;
}

const PO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 \-_/.#]{2,39}$/;

export function PaymentStep({
  user,
  total,
  intent,
  loading,
  onPlace,
}: {
  user: SessionUser | null;
  total: number;
  intent: Intent;
  loading: boolean;
  onPlace: (input: PlaceOrderInput) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [number, setNumber] = useState<string>(TEST_CARDS.visa.number);
  const [expiry, setExpiry] = useState("12/28");
  const [cvc, setCvc] = useState<string>(TEST_CARDS.visa.cvc);
  const [postal, setPostal] = useState("90210");
  const [poNumber, setPoNumber] = useState("");

  const stripeLive = intent?.mode === "stripe" && Boolean(intent.clientSecret && intent.publishableKey);
  const demoCard = intent?.mode === "demo";
  const netEligible = user?.accountTier === "wholesale" && user.emailVerified;
  const brand = brandOf(number);
  const unavailable = intent?.mode === "unavailable";

  // Card payments are switched off (live store without Stripe keys): start on a method that works.
  useEffect(() => {
    if (unavailable) setMethod((current) => (current === "card" ? (netEligible ? "net30" : "ach") : current));
  }, [unavailable, netEligible]);

  const choose = (next: PaymentMethod) => {
    setMethod(next);
    setError(null);
  };

  const fillTestCard = (key: TestCardKey) => {
    const card = TEST_CARDS[key];
    setNumber(card.number);
    setCvc(card.cvc);
    setExpiry("12/28");
    setPostal("90210");
    setError(null);
  };

  const submitDemoCard = async () => {
    setError(null);
    const raw = digits(number);
    const known = Object.values(TEST_CARDS).find((card) => digits(card.number) === raw);
    if (!known) {
      setError(
        "Demo mode only accepts Stripe test cards (use the quick-fill buttons). Real card numbers are never accepted or sent.",
      );
      return;
    }
    const expiryProblem = expiryError(expiry);
    if (expiryProblem) return setError(expiryProblem);
    if (digits(cvc).length !== (known.brand === "AMEX" ? 4 : 3)) {
      return setError(`CVC must be ${known.brand === "AMEX" ? 4 : 3} digits for this card.`);
    }
    if (digits(postal).length < 5) return setError("Enter a 5-digit billing ZIP code.");
    if (raw === digits(TEST_CARDS.declined.number)) {
      return setError("Your card was declined (Stripe test card 4000 0000 0000 0002). Try a different test card.");
    }
    // Only the method is sent — card fields stay in this component and are cleared.
    setNumber("");
    setCvc("");
    await onPlace({ method: "card", paymentRef: null });
  };

  const submitNet30 = async () => {
    setError(null);
    if (!PO_PATTERN.test(poNumber.trim())) {
      return setError("Enter your purchase order number (3–40 letters, numbers, dashes or slashes).");
    }
    await onPlace({ method: "net30", paymentRef: null, poNumber: poNumber.trim() });
  };

  const submitAch = async () => {
    setError(null);
    await onPlace({ method: "ach", paymentRef: null });
  };

  const tabs: { key: PaymentMethod; label: string; icon: typeof CreditCard; sub: string }[] = [
    { key: "card", label: "Credit card", icon: CreditCard, sub: "Pay now" },
    { key: "net30", label: "Net-30 PO invoice", icon: Building2, sub: netEligible ? "Trade account" : "Approved accounts" },
    { key: "ach", label: "ACH / wire", icon: Landmark, sub: "Ships after payment" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Payment method">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={method === tab.key}
            onClick={() => choose(tab.key)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3.5 text-center transition-colors ${
              method === tab.key
                ? "border-ink bg-ink text-cream"
                : "border-ink/15 bg-[#fffdf8] text-ink hover:border-ink/40"
            }`}
          >
            <tab.icon size={18} />
            <span className="text-[12.5px] font-bold">{tab.label}</span>
            <span className={`text-[10px] ${method === tab.key ? "text-cream/60" : "text-ink/45"}`}>
              {tab.sub}
            </span>
          </button>
        ))}
      </div>

      {/* Card ------------------------------------------------------ */}
      {method === "card" ? (
        stripeLive ? (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-[10.5px] text-ink/55">
              <ShieldCheck size={12} className="text-fern" /> Card details are entered inside Stripe-hosted
              iframes and tokenised before they reach our servers.
            </p>
            <StripePaymentPanel
              publishableKey={intent!.publishableKey as string}
              clientSecret={intent!.clientSecret as string}
              disabled={!terms || loading}
              onPaid={async (paymentIntentId) => onPlace({ method: "card", paymentRef: paymentIntentId })}
            />
          </div>
        ) : demoCard ? (
          <div className="rounded-2xl bg-[#101a2c] p-5 text-cream">
            <div className="flex items-center justify-between border-b border-cream/12 pb-3">
              <p className="font-mono text-[11px] text-cream/60">demo card form · nothing is charged</p>
              <span className="rounded-full bg-gold/20 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#f6c84c] uppercase">
                Test mode
              </span>
            </div>

            <label className="mt-4 block text-[11px] font-medium text-cream/60" htmlFor="demo-card-number">
              Card number
            </label>
            <div className="relative mt-1.5">
              <input
                id="demo-card-number"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={number}
                onChange={(event) => setNumber(formatCardNumber(event.target.value))}
                placeholder="4242 4242 4242 4242"
                className="w-full rounded-lg border border-cream/20 bg-[#050b17] px-4 py-3.5 pr-16 font-mono text-[17px] tracking-wider text-[#3ddc97] placeholder:text-cream/25 focus:border-[#3ddc97]/60 focus:outline-none"
              />
              {brand ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-cream/10 px-2 py-1 font-mono text-[10px] font-bold text-cream/80">
                  {brand}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { id: "demo-exp", label: "Expires", value: expiry, set: (v: string) => setExpiry(formatExpiry(v)), ph: "MM/YY", max: 5 },
                { id: "demo-cvc", label: "CVC / CVV", value: cvc, set: (v: string) => setCvc(digits(v).slice(0, 4)), ph: "345", max: 4 },
                { id: "demo-zip", label: "Billing ZIP", value: postal, set: (v: string) => setPostal(digits(v).slice(0, 5)), ph: "90210", max: 5 },
              ].map((field) => (
                <div key={field.id}>
                  <label className="block text-[11px] font-medium text-cream/60" htmlFor={field.id}>
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={field.max}
                    value={field.value}
                    onChange={(event) => field.set(event.target.value)}
                    placeholder={field.ph}
                    className="mt-1.5 w-full rounded-lg border border-cream/20 bg-[#050b17] px-3.5 py-3 font-mono text-[14px] text-cream placeholder:text-cream/25 focus:border-[#3ddc97]/60 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-cream/12 pt-3">
              <p className="text-[11px] font-semibold text-cream/70">Quick test cards</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(TEST_CARDS) as TestCardKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => fillTestCard(key)}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      key === "declined"
                        ? "border-clay/50 text-[#ff9b7a] hover:bg-clay/15"
                        : "border-cream/25 text-cream/85 hover:bg-cream/10"
                    }`}
                  >
                    {TEST_CARDS[key].label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-cream/45">
                This sandbox has no Stripe keys, so this is a simulation: card fields stay in your browser and
                are never sent. Only Stripe&apos;s test numbers are accepted. With keys configured, this panel
                is replaced by Stripe Elements.
              </p>
            </div>
          </div>
        ) : unavailable ? (
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-5">
            <p className="flex items-center gap-2 text-[13px] font-bold">
              <Lock size={14} /> Card payments are not enabled yet
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/65">
              Pay by ACH / wire transfer{netEligible ? ", or place the order on Net-30 with a purchase order" : ""}.
              Questions? Contact the trade desk at {SITE.email} or {SITE.phone}.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-ink/10 bg-parchment/40 px-4 py-6 text-center text-[11.5px] text-ink/50">
            <Loader2 size={14} className="mr-1.5 inline animate-spin" /> Initialising secure payment session…
          </p>
        )
      ) : null}

      {/* Net-30 ---------------------------------------------------- */}
      {method === "net30" ? (
        netEligible ? (
          <div className="rounded-xl border border-ink/12 bg-[#fffdf8] p-5">
            <p className="text-[13px] font-bold">Pay on Net-30 terms</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink/60">
              Your order ships without card payment and an invoice is due 30 days from the order date. Quote
              your purchase order number so it prints on the invoice and packing slip.
            </p>
            <label className="label mt-4" htmlFor="po-number">
              Purchase order number *
            </label>
            <input
              id="po-number"
              className="field font-mono"
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value.slice(0, 40))}
              placeholder="PO-2026-0417"
              autoComplete="off"
            />
            <p className="mt-3 rounded-md bg-gold/12 px-3 py-2 text-[10.5px] leading-relaxed text-[#7a5a1f]">
              Demo: terms are available to any approved trade account. No credit limit or credit check is
              applied yet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-5">
            <p className="flex items-center gap-2 text-[13px] font-bold">
              <Lock size={14} /> Net-30 is for approved trade accounts
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/65">
              {user
                ? user.accountTier !== "wholesale"
                  ? "Your account is not approved for wholesale yet. Apply to unlock invoice terms."
                  : "Confirm your email address to unlock invoice terms."
                : "Sign in with an approved wholesale account to pay by purchase order."}
            </p>
            <div className="mt-3 flex gap-2">
              {!user ? (
                <Link href="/login?next=/checkout" className="btn btn-primary btn-sm">
                  Sign in
                </Link>
              ) : null}
              <Link href="/wholesale/apply" className="btn btn-outline btn-sm">
                Apply for trade
              </Link>
            </div>
          </div>
        )
      ) : null}

      {/* ACH / wire ------------------------------------------------ */}
      {method === "ach" ? (
        <div className="rounded-xl border border-ink/12 bg-[#fffdf8] p-5">
          <p className="text-[13px] font-bold">Pay by ACH or wire transfer</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink/60">
            We reserve your cases and email remittance instructions. The order is held and ships once the
            transfer clears — typically 1–3 business days for ACH, same day for wire.
          </p>
          <ul className="mt-3 space-y-1.5 text-[11px] text-ink/55">
            <li>• Amount due: <strong className="text-ink">{formatMoney(total)}</strong></li>
            <li>• Reference your order number on the transfer</li>
            <li>• Bank details are sent by the trade desk — never shown on this page</li>
          </ul>
        </div>
      ) : null}

      <label className="flex items-start gap-2.5 text-[10.5px] leading-relaxed text-ink/60">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => setTerms(event.target.checked)}
          className="mt-0.5 accent-[#14241c]"
        />
        <span>
          I am authorised to purchase for this business, accept the{" "}
          <Link href="/wholesale#terms" className="underline">
            wholesale terms
          </Link>
          , and confirm the delivery address and freight service above. Freight is re-rated at pickup if
          carton dimensions differ.
        </span>
      </label>

      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-clay/30 bg-clay/10 px-3 py-2.5 text-[11.5px] font-medium text-clay">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {method === "card" && demoCard ? (
        <button
          onClick={submitDemoCard}
          disabled={!terms || loading}
          className="btn btn-primary w-full py-4 text-[14px]"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          Authorize &amp; place order · {formatMoney(total)}
        </button>
      ) : null}
      {method === "net30" && netEligible ? (
        <button
          onClick={submitNet30}
          disabled={!terms || loading}
          className="btn btn-primary w-full py-4 text-[14px]"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
          Place order on Net-30 · {formatMoney(total)}
        </button>
      ) : null}
      {method === "ach" ? (
        <button
          onClick={submitAch}
          disabled={!terms || loading}
          className="btn btn-primary w-full py-4 text-[14px]"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
          Place order · pay by ACH / wire · {formatMoney(total)}
        </button>
      ) : null}
    </div>
  );
}
