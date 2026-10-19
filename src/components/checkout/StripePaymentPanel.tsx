"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Lock, ShieldCheck } from "lucide-react";

function InnerForm({
  onPaid,
  disabled,
}: {
  onPaid: (paymentIntentId: string) => Promise<void>;
  disabled: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMessage(null);
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/checkout/complete` },
    });

    if (result.error) {
      setMessage(result.error.message ?? "Payment could not be completed.");
      setBusy(false);
      return;
    }
    // Authorised (captured by the server once the order is recorded) or already captured.
    const status = result.paymentIntent?.status;
    if (result.paymentIntent && (status === "requires_capture" || status === "succeeded")) {
      await onPaid(result.paymentIntent.id);
      setBusy(false);
      return;
    }
    setMessage(
      status === "processing"
        ? "Your bank is still confirming this payment. Do not pay again — check your account in a few minutes."
        : `The payment was not completed (${status ?? "unknown"}). You have not been charged.`,
    );
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-ink/12 bg-white p-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink/50">
        <Lock size={12} className="mt-0.5 shrink-0" />
        Card details are entered inside Stripe-hosted iframes and tokenised before they reach our
        servers. Ciputra never receives, logs or stores a card number — SAQ-A scope.
      </p>
      {message ? (
        <p className="rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11.5px] text-clay">{message}</p>
      ) : null}
      <button type="submit" disabled={!stripe || busy || disabled} className="btn btn-clay w-full">
        {busy ? "Authorising…" : "Pay securely"}
        <ShieldCheck size={15} />
      </button>
    </form>
  );
}

export function StripePaymentPanel({
  publishableKey,
  clientSecret,
  onPaid,
  disabled,
}: {
  publishableKey: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  disabled: boolean;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#14241c",
            colorBackground: "#ffffff",
            colorText: "#14241c",
            fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            borderRadius: "8px",
          },
        },
      }}
    >
      <InnerForm onPaid={onPaid} disabled={disabled} />
    </Elements>
  );
}
