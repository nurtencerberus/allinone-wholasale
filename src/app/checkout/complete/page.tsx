import { CheckoutComplete } from "@/components/checkout/CheckoutComplete";

export const metadata = {
  title: "Confirming your order",
  robots: { index: false, follow: false },
};

/** Stripe returns here after a 3-D Secure (or other redirect) confirmation. */
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>;
}) {
  const { payment_intent: paymentIntentId, redirect_status: redirectStatus } = await searchParams;
  return <CheckoutComplete paymentIntentId={paymentIntentId ?? null} redirectStatus={redirectStatus ?? null} />;
}
