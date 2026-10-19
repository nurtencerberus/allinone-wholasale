import type { CheckoutPayload } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { CartItemInput, CheckoutAddress } from "@/lib/checkout";

export type CheckoutRequestBody = {
  items?: CartItemInput[];
  couponCode?: string | null;
  address?: CheckoutAddress | null;
  shippingOptionId?: string | null;
  email?: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  /** Random id the browser keeps for one checkout attempt; makes retries idempotent. */
  checkoutId?: string;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** Validates and normalises what the browser sends at the payment step. */
export function parseCheckoutRequest(
  body: CheckoutRequestBody,
  user: SessionUser,
): { ok: true; payload: CheckoutPayload; checkoutId: string } | { ok: false; error: string } {
  const email = clip(body.email, 200).toLowerCase() || user.email;
  const name = clip(body.name, 120) || user.name;
  const address = body.address;
  if (!EMAIL.test(email)) return { ok: false, error: "A valid email address is required." };
  if (name.length < 2) return { ok: false, error: "A receiving contact name is required." };
  if (!address?.line1?.trim() || !address.city?.trim() || !address.state || !address.zip) {
    return { ok: false, error: "A complete delivery address is required." };
  }
  if (!body.shippingOptionId) return { ok: false, error: "Select a freight option." };
  const checkoutId = clip(body.checkoutId, 64);
  if (!/^[A-Za-z0-9-]{16,64}$/.test(checkoutId)) return { ok: false, error: "Checkout session expired. Reload the page." };

  return {
    ok: true,
    checkoutId,
    payload: {
      items: (body.items ?? []).map((item) => ({ productId: Number(item.productId), cases: Number(item.cases) })),
      couponCode: clip(body.couponCode, 40) || null,
      address: {
        line1: clip(address.line1, 120),
        line2: clip(address.line2, 120),
        city: clip(address.city, 80),
        state: clip(address.state, 2).toUpperCase(),
        zip: clip(address.zip, 5),
      },
      shippingOptionId: clip(body.shippingOptionId, 120),
      contact: {
        email,
        name,
        company: clip(body.company ?? user.company, 120) || null,
        phone: clip(body.phone, 40) || null,
        notes: clip(body.notes, 1000) || null,
      },
    },
  };
}
