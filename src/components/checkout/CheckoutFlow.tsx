"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Ruler,
  ShieldCheck,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { PaymentStep, type PlaceOrderInput } from "@/components/checkout/PaymentStep";
import type { SessionUser } from "@/lib/auth";
import type { PricedOrder } from "@/lib/checkout";
import { SERVICE_STATES } from "@/lib/ship-to";
import { formatMoney, formatRate } from "@/lib/money";

type SavedAddress = {
  id: number;
  label: string;
  name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  isDefault: boolean;
};

const STEPS = [
  { id: 1, label: "Contact & delivery" },
  { id: 2, label: "Freight & tax" },
  { id: 3, label: "Payment" },
];

export function CheckoutFlow({
  user,
  savedAddresses,
}: {
  user: SessionUser | null;
  savedAddresses: SavedAddress[];
}) {
  const { items, subtotal, clear, hydrated, removeItem } = useCart();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [contact, setContact] = useState({
    email: user?.email ?? "",
    name: user?.name ?? "",
    company: user?.company ?? "",
    phone: "",
    notes: "",
  });
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
  });
  const [selectedAddressId, setSelectedAddressId] = useState<number | "">("");
  const [quote, setQuote] = useState<PricedOrder | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [intent, setIntent] = useState<{ mode: "stripe" | "demo" | "unavailable"; clientSecret: string | null; publishableKey: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per checkout attempt: retries of the same submit are recognised server-side.
  const [checkoutId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  );

  const payload = items.map((item) => ({ productId: item.productId, cases: item.cases }));


  useEffect(() => {
    const preferred = savedAddresses.find((entry) => entry.isDefault) ?? savedAddresses[0];
    if (preferred) applySavedAddress(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySavedAddress = (entry: SavedAddress) => {
    setSelectedAddressId(entry.id);
    setAddress({
      line1: entry.line1,
      line2: entry.line2 ?? "",
      city: entry.city,
      state: entry.state,
      zip: entry.zip,
    });
    setContact((current) => ({
      ...current,
      name: current.name || entry.name,
      company: current.company || (entry.company ?? ""),
      phone: current.phone || (entry.phone ?? ""),
    }));
  };

  const requestQuote = useCallback(
    async (options: { shippingOptionId?: string | null; coupon?: string } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: payload,
            address: {
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              state: address.state,
              zip: address.zip,
              country: "United States",
            },
            couponCode: options.coupon ?? couponCode ?? undefined,
            shippingOptionId: options.shippingOptionId ?? undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not price this cart.");
        const priced = data.quote as PricedOrder;
        priced.removedProductIds.forEach((productId) => removeItem(productId));
        setQuote(priced);
        // Blockers (minimums, stock, delivery area) stop the flow here; the server enforces the same.
        if (priced.blockers.length) {
          setError(priced.blockers.join(" "));
          return null;
        }
        return priced;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not price this cart.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, couponCode, JSON.stringify(payload), removeItem],
  );

  const gotoFreight = async () => {
    if (!contact.email.includes("@")) return setError("Enter a valid email address.");
    if (contact.name.trim().length < 2) return setError("Enter the receiving contact name.");
    if (!address.line1.trim() || !address.city.trim()) return setError("Enter a delivery street and city.");
    if (!address.state) return setError("Select the destination state.");
    if (!/^\d{5}$/.test(address.zip)) return setError("Enter a 5-digit delivery ZIP code.");
    const priced = await requestQuote();
    if (priced) {
      setStep(2);
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  };

  const gotoPayment = async () => {
    const priced = await requestQuote({ shippingOptionId: quote?.shippingOptionId });
    if (!priced) return;
    if (!priced.shippingOptionId) return setError("Select a freight service to continue.");
    setStep(3);
    setLoading(true);
    try {
      const response = await fetch("/api/checkout/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payload,
          address,
          couponCode: couponCode || undefined,
          shippingOptionId: priced.shippingOptionId,
          checkoutId,
          ...contact,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not initialise payment.");
      // The return page after a 3-D Secure redirect needs to know which cart to clear.
      try {
        window.sessionStorage.setItem("checkout:pending", String(data.paymentIntentId ?? ""));
      } catch {}
      setIntent({ mode: data.mode, clientSecret: data.clientSecret, publishableKey: data.publishableKey });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not initialise payment.");
    } finally {
      setLoading(false);
    }
    window.scrollTo({ top: 120, behavior: "smooth" });
  };

  const placeOrder = async (input: PlaceOrderInput) => {
    setLoading(true);
    setError(null);
    try {
      const data = await submitOrder({
        items: payload,
        address,
        couponCode: couponCode || undefined,
        shippingOptionId: quote?.shippingOptionId,
        checkoutId,
        ...contact,
        paymentIntentId: input.paymentRef,
        paymentMethod: input.method,
        poNumber: input.poNumber,
      });
      clear();
      router.push(`/order/${data.orderNumber}?t=${data.accessToken}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order could not be placed.");
      setLoading(false);
    }
  };

  if (hydrated && items.length === 0) {
    return (
      <div className="wrap flex min-h-[52vh] flex-col items-center justify-center py-20 text-center">
        <Boxes size={34} className="text-ink/30" />
        <h1 className="display mt-4 text-[32px]">Nothing to check out yet</h1>
        <p className="mt-2 max-w-sm text-[13px] text-ink/55">
          Your cart is empty. Build a case order and return — freight and destination tax are priced live.
        </p>
        <Link href="/shop" className="btn btn-primary mt-5">
          Browse the catalog <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  const localSubtotal = quote?.subtotal ?? subtotal;
  const displayTotal = quote?.total ?? subtotal;

  return (
    <div className="wrap py-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/50 hover:text-ink">
            <ArrowLeft size={13} /> Continue shopping
          </Link>
          <h1 className="display mt-2 text-[32px] leading-tight sm:text-[38px]">Wholesale checkout</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-[#fffdf8] px-3.5 py-2 text-[10.5px] font-semibold text-ink/60">
          <Lock size={12} className="text-fern" /> 256-bit TLS · Stripe tokenised · PCI-DSS SAQ-A
        </div>
      </div>

      {user && !user.emailVerified ? (
        <div className="mt-5 rounded-lg border border-gold/50 bg-gold/10 px-4 py-3">
          <p className="text-[11.5px] font-bold text-ink">
            Confirm your email before placing this order
          </p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink/60">
            Double opt-in is required for trade ordering so tracking and freight updates reach you.{" "}
            <Link href="/account" className="font-bold underline">
              Resend the confirmation link
            </Link>{" "}
            from your account page.
          </p>
        </div>
      ) : null}

      <ol className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-ink/10 py-3.5">
        {STEPS.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (entry.id < step) setStep(entry.id);
              }}
              className="flex items-center gap-2"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  step === entry.id
                    ? "bg-ink text-cream"
                    : step > entry.id
                      ? "bg-fern text-cream"
                      : "border border-ink/20 text-ink/40"
                }`}
              >
                {step > entry.id ? <Check size={12} /> : entry.id}
              </span>
              <span
                className={`text-[11.5px] font-semibold ${
                  step === entry.id ? "text-ink" : "text-ink/45"
                }`}
              >
                {entry.label}
              </span>
            </button>
            {index < STEPS.length - 1 ? <span className="h-px w-6 bg-ink/15 sm:w-10" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          {error ? (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-clay/30 bg-clay/10 px-4 py-3 text-[12px] text-clay">
              <p className="font-medium">{error}</p>
              <button onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          ) : null}

          {/* STEP 1 ------------------------------------------------- */}
          <section className={`card p-5 ${step !== 1 ? "opacity-95" : ""}`}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[14px] font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] text-cream">1</span>
                Contact & delivery address
              </h2>
              {step !== 1 && contact.email ? (
                <button onClick={() => setStep(1)} className="text-[11px] font-bold text-fern underline">
                  Edit
                </button>
              ) : null}
            </div>

            {step === 1 ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-parchment/60 px-3 py-2 text-[11px]">
                  <span className="text-ink/60">
                    {user ? `Signed in as ${user.email}` : "Guest checkout — an account is optional."}
                  </span>
                  {!user ? (
                    <Link href="/login?next=/checkout" className="font-bold text-ink underline">
                      Sign in for saved addresses
                    </Link>
                  ) : null}
                </div>

                {savedAddresses.length ? (
                  <div className="flex flex-wrap gap-2">
                    {savedAddresses.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => applySavedAddress(entry)}
                        className={`rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${
                          selectedAddressId === entry.id
                            ? "border-ink bg-fern/5"
                            : "border-ink/15 hover:border-ink/40"
                        }`}
                      >
                        <span className="block font-bold">{entry.label}</span>
                        <span className="block text-ink/50">
                          {entry.city}, {entry.state} {entry.zip}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="email">Email for order confirmation *</label>
                    <input
                      id="email"
                      type="email"
                      className="field"
                      autoComplete="email"
                      value={contact.email}
                      onChange={(event) => setContact({ ...contact, email: event.target.value })}
                      placeholder="buyer@yourstore.com"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="name">Receiving contact *</label>
                    <input
                      id="name"
                      className="field"
                      autoComplete="name"
                      value={contact.name}
                      onChange={(event) => setContact({ ...contact, name: event.target.value })}
                      placeholder="Dana Whitfield"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="company">Business name</label>
                    <input
                      id="company"
                      className="field"
                      autoComplete="organization"
                      value={contact.company}
                      onChange={(event) => setContact({ ...contact, company: event.target.value })}
                      placeholder="Harbor House Pharmacy"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="line1">Street address *</label>
                    <input
                      id="line1"
                      className="field"
                      autoComplete="address-line1"
                      value={address.line1}
                      onChange={(event) => setAddress({ ...address, line1: event.target.value })}
                      placeholder="88 Exchange Street"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="line2">Suite / dock / bay</label>
                    <input
                      id="line2"
                      className="field"
                      autoComplete="address-line2"
                      value={address.line2}
                      onChange={(event) => setAddress({ ...address, line2: event.target.value })}
                      placeholder="Bay 3"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="city">City *</label>
                    <input
                      id="city"
                      className="field"
                      autoComplete="address-level2"
                      value={address.city}
                      onChange={(event) => setAddress({ ...address, city: event.target.value })}
                      placeholder="Portland"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="state">State *</label>
                      <select
                        id="state"
                        className="field"
                        value={address.state}
                        onChange={(event) => setAddress({ ...address, state: event.target.value })}
                      >
                        <option value="">Select</option>
                        {SERVICE_STATES.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.code} — {state.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="zip">ZIP *</label>
                      <input
                        id="zip"
                        className="field"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        maxLength={5}
                        value={address.zip}
                        onChange={(event) =>
                          setAddress({ ...address, zip: event.target.value.replace(/\D/g, "").slice(0, 5) })
                        }
                        onBlur={() => {
                          // Re-price destination tax + dimensional freight as soon as the ZIP is complete.
                          if (/^\d{5}$/.test(address.zip) && address.state && items.length) {
                            void requestQuote();
                          }
                        }}
                        placeholder="04101"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="phone">Freight phone</label>
                    <input
                      id="phone"
                      className="field"
                      autoComplete="tel"
                      value={contact.phone}
                      onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                      placeholder="(207) 555-0184 — used by the LTL carrier to schedule delivery"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-ink/20 bg-parchment/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-ink/55">
                  <MapPin size={12} className="mr-1 inline" />
                  ZIP <strong>{address.zip || "-----"}</strong> locks the destination sales-tax jurisdiction and
                  the freight zone. Enter it now — we re-price both before payment.
                </div>

                <button onClick={gotoFreight} disabled={loading} className="btn btn-primary w-full">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                  Price freight & tax
                </button>
              </div>
            ) : (
              <div className="mt-3 text-[11.5px] leading-relaxed text-ink/60">
                <p className="font-semibold text-ink">{contact.name} · {contact.company || "—"}</p>
                <p>{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.zip}</p>
                <p>{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}</p>
              </div>
            )}
          </section>

          {/* STEP 2 ------------------------------------------------- */}
          <section className={`card p-5 ${step < 2 ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[14px] font-bold">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step >= 2 ? "bg-ink text-cream" : "border border-ink/20 text-ink/40"}`}>2</span>
                Dimensional freight & destination tax
              </h2>
              {step > 2 ? (
                <button onClick={() => setStep(2)} className="text-[11px] font-bold text-fern underline">Edit</button>
              ) : null}
            </div>

            {step === 2 && quote ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Billable weight", value: `${quote.freight.billableLbs} lb` },
                    { label: "Dimensional", value: `${quote.freight.dimWeightLbs} lb` },
                    { label: "Cartons", value: `${quote.freight.cartons}` },
                    { label: "Zone", value: `${quote.freight.zone}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border border-ink/10 bg-parchment/40 px-2.5 py-2">
                      <p className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">{item.label}</p>
                      <p className="mt-0.5 text-[13px] font-bold">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {quote.shippingOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        quote.shippingOptionId === option.id
                          ? "border-ink bg-fern/5"
                          : "border-ink/15 hover:border-ink/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shipping"
                        className="mt-1 accent-[#14241c]"
                        checked={quote.shippingOptionId === option.id}
                        onChange={() => requestQuote({ shippingOptionId: option.id })}
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[12.5px] font-bold">
                            {option.carrier} · {option.service}
                          </p>
                          <p className="text-[13px] font-bold tabular-nums">
                            {option.cost === 0 ? "Freight allowance" : formatMoney(option.cost)}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-ink/50">
                          {option.transitDays} · {option.mode === "ltl" ? "Curbside LTL" : "Parcel"}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-ink/45">{option.note}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <p className="flex items-start gap-2 rounded-md bg-parchment/60 px-3 py-2 text-[10.5px] leading-relaxed text-ink/55">
                  <Ruler size={12} className="mt-0.5 shrink-0" />
                  {quote.shippingNote} Sourced from{" "}
                  <strong className="font-semibold">
                    {quote.shippingSource === "easypost" ? "EasyPost live rates" : "Ciputra dimensional matrix"}
                  </strong>.
                </p>

                <div className="rounded-lg border border-ink/12 p-3.5">
                  <p className="flex items-center gap-2 text-[11px] font-bold">
                    <Tag size={13} /> Coupon or trade code
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="field"
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                      placeholder="MERIDIAN10"
                    />
                    <button
                      onClick={async () => {
                        const code = couponInput.trim().toUpperCase();
                        if (!code) return;
                        const priced = await requestQuote({ coupon: code });
                        if (priced) {
                          setCouponCode(code);
                          setError(null);
                        }
                      }}
                      className="btn btn-outline btn-sm shrink-0"
                      disabled={loading}
                    >
                      Apply
                    </button>
                    {couponCode ? (
                      <button
                        onClick={async () => {
                          setCouponCode("");
                          setCouponInput("");
                          await requestQuote({ coupon: "" });
                        }}
                        className="btn btn-sm shrink-0 border border-ink/15 text-ink/50"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                  {quote.couponCode ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-fern">
                      <BadgeCheck size={12} /> {quote.couponCode} — {quote.couponLabel}
                    </p>
                  ) : (
                    <p className="mt-2 text-[10px] text-ink/40">
                      Try MERIDIAN10 (10% off) or WELCOME25 ($25 off $250+).
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-fern/25 bg-fern/5 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-fern">
                        <ShieldCheck size={13} /> Sales tax · {quote.taxQuote.source === "exempt" ? "Exempt" : quote.taxQuote.source === "no_nexus" ? "Not collected" : formatRate(quote.taxQuote.rateX1000)}
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink/60">{quote.taxQuote.jurisdiction}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-ink/45">{quote.taxQuote.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold tabular-nums">{formatMoney(quote.taxAmount)}</p>
                      <p className="text-[9px] font-semibold tracking-wide text-ink/40 uppercase">
                        {quote.taxQuote.source === "exempt" ? "Resale exempt" : quote.taxQuote.source === "no_nexus" ? "Not collected" : "State rate"}
                      </p>
                    </div>
                  </div>
                  {quote.messages.map((message) => (
                    <p key={message} className="mt-2 border-t border-fern/15 pt-2 text-[10.5px] text-clay">
                      {message}
                    </p>
                  ))}
                </div>

                <button onClick={gotoPayment} disabled={loading} className="btn btn-primary w-full">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  Continue to payment · {formatMoney(quote.total)}
                </button>
              </div>
            ) : step > 2 && quote ? (
              <div className="mt-3 text-[11.5px] leading-relaxed text-ink/60">
                <p className="font-semibold text-ink">
                  {quote.shippingCarrier} · {quote.shippingService} — {formatMoney(quote.shippingCost)}
                </p>
                <p>
                  {quote.freight.billableLbs} lb billable · tax {formatRate(quote.taxQuote.rateX1000)} ·{" "}
                  {quote.freight.palletised ? "LTL-eligible" : "parcel"}
                </p>
              </div>
            ) : null}
          </section>

          {/* STEP 3 ------------------------------------------------- */}
          <section className={`card p-5 ${step < 3 ? "opacity-50" : ""}`}>
            <h2 className="flex items-center gap-2 text-[14px] font-bold">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step >= 3 ? "bg-ink text-cream" : "border border-ink/20 text-ink/40"}`}>3</span>
              Payment
            </h2>

            {step === 3 ? (
              <PaymentStep
                user={user}
                total={displayTotal}
                intent={intent}
                loading={loading}
                onPlace={placeOrder}
              />
            ) : (
              <p className="mt-2 text-[11px] text-ink/40">Complete freight and tax to unlock payment.</p>
            )}
          </section>
        </div>

        {/* SUMMARY ------------------------------------------------- */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Order summary</p>
              <p className="text-[11px] font-semibold text-ink/50">
                {quote ? `${quote.cases} cases · ${quote.unitCount} units` : `${items.length} SKUs`}
              </p>
            </div>
            <ul className="max-h-[300px] divide-y divide-ink/8 overflow-y-auto">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3 px-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.name} className="h-12 w-12 rounded border border-ink/10 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11.5px] font-semibold leading-snug">{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-ink/45">
                      {item.cases} × {item.caseSize} units · {formatMoney(
                        quote?.lines.find((line) => line.productId === item.productId)?.casePrice ?? item.casePrice,
                      )}/case
                    </p>
                  </div>
                  <p className="text-[11.5px] font-bold tabular-nums">
                    {formatMoney(
                      (quote?.lines.find((line) => line.productId === item.productId)?.casePrice ?? item.casePrice) *
                        item.cases,
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-ink/10 px-4 py-3.5 text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-ink/60">Catalog subtotal</span>
                <span className="font-semibold tabular-nums">{formatMoney(quote?.subtotal ?? localSubtotal)}</span>
              </div>
              {quote && quote.lines.some((line) => line.tierSaving + line.accountSaving > 0) ? (
                <div className="flex justify-between text-fern">
                  <span>Trade & volume savings</span>
                  <span className="font-semibold tabular-nums">
                    −
                    {formatMoney(
                      quote.lines.reduce((sum, line) => sum + line.tierSaving + line.accountSaving, 0),
                    )}
                  </span>
                </div>
              ) : null}
              {quote?.couponDiscount ? (
                <div className="flex justify-between text-fern">
                  <span>Coupon {quote.couponCode}</span>
                  <span className="font-semibold tabular-nums">−{formatMoney(quote.couponDiscount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-ink/60">Freight</span>
                <span className="font-semibold tabular-nums">
                  {quote ? (quote.shippingCost === 0 ? "Waived" : formatMoney(quote.shippingCost)) : "Quoted next"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">
                  Sales tax {quote ? `(${formatRate(quote.taxQuote.rateX1000)})` : ""}
                </span>
                <span className="font-semibold tabular-nums">
                  {quote ? formatMoney(quote.taxAmount) : "By ZIP"}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between border-t border-ink/10 pt-2.5">
                <span className="text-[12px] font-bold">Total due</span>
                <span className="display text-[24px] leading-none">{formatMoney(displayTotal)}</span>
              </div>
              <p className="pt-1 text-[9.5px] leading-relaxed text-ink/40">
                USD · FOB Paterson, NJ. Sales tax and freight are recalculated server-side on order
                submission.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2 rounded-lg border border-ink/10 bg-[#fffdf8] p-3.5 text-[10px] leading-relaxed text-ink/55">
            <p className="flex items-center gap-2"><ShieldCheck size={12} className="text-fern" /> Stripe Elements · card data never touches our API</p>
            <p className="flex items-center gap-2"><Truck size={12} className="text-fern" /> UPS Ground, 2nd Day & LTL compared at once</p>
            <p className="flex items-center gap-2"><BadgeCheck size={12} className="text-fern" /> Destination tax via nexus rules{user?.taxExempt ? " / resale exemption" : ""}</p>
          </div>

          {user?.accountTier === "wholesale" ? (
            <div className="mt-3 rounded-lg bg-moss p-3.5 text-[10.5px] leading-relaxed text-cream/80">
              <p className="font-bold text-cream">Trade account pricing active</p>
              <p className="mt-1">
                {user.wholesaleDiscountPct}% contract discount applied
                {user.taxExempt ? " · resale certificate verified" : ""}. Server-side repricing runs again
                when the order is created.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * Posts the order. A card order may still be finalising (the Stripe webhook got there first),
 * in which case the server answers 202 and we ask again shortly.
 */
export async function submitOrder(body: Record<string, unknown>): Promise<{ orderNumber: string; accessToken: string }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) return data;
    if (!data.retry) throw new Error(data.error ?? "Order could not be placed.");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Your payment is being confirmed. Check your account's order history in a minute.");
}
