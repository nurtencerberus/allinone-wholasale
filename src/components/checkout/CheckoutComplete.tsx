"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { submitOrder } from "@/components/checkout/CheckoutFlow";

export function CheckoutComplete({
  paymentIntentId,
  redirectStatus,
}: {
  paymentIntentId: string | null;
  redirectStatus: string | null;
}) {
  const router = useRouter();
  const { clear } = useCart();
  const [error, setError] = useState<string | null>(
    !paymentIntentId
      ? "No payment to confirm."
      : redirectStatus === "failed"
        ? "Your bank did not approve the payment. You have not been charged."
        : null,
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !paymentIntentId || redirectStatus === "failed") return;
    started.current = true;
    submitOrder({ paymentMethod: "card", paymentIntentId })
      .then((data) => {
        try {
          window.sessionStorage.removeItem("checkout:pending");
        } catch {}
        clear();
        router.replace(`/order/${data.orderNumber}?t=${data.accessToken}`);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [paymentIntentId, redirectStatus, clear, router]);

  return (
    <div className="wrap flex min-h-[52vh] flex-col items-center justify-center py-20 text-center">
      {error ? (
        <>
          <h1 className="display text-[30px]">We could not confirm this order</h1>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink/72" role="alert">{error}</p>
          <Link href="/checkout" className="btn btn-primary mt-5">Back to checkout</Link>
        </>
      ) : (
        <>
          <Loader2 size={28} className="animate-spin text-ink/65" />
          <h1 className="display mt-4 text-[28px]">Confirming your order…</h1>
          <p className="mt-2 text-[12.5px] text-ink/70" aria-live="polite">Please keep this page open.</p>
        </>
      )}
    </div>
  );
}
