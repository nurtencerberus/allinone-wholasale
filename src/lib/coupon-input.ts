import { ACCOUNT_TIERS } from "@/lib/access";

/**
 * Validation for what the admin coupon form sends (SEP-6). Kept pure and away from the route so
 * every rule is unit-tested; money arrives in dollars from the form and is stored in cents.
 */
export const COUPON_KINDS = ["percent", "fixed", "shipping"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export type CouponInput = {
  code: string;
  kind: CouponKind;
  /** Percent (1–100) for "percent", cents for "fixed", ignored for "shipping". */
  value: number;
  minSubtotal: number;
  description: string;
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  allowedTiers: string[];
  stackable: boolean;
};

export class CouponInputError extends Error {}

function optionalDate(raw: unknown, field: string): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = new Date(text);
  if (Number.isNaN(value.getTime())) throw new CouponInputError(`${field} is not a valid date.`);
  return value;
}

function optionalCount(raw: unknown, field: string): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new CouponInputError(`${field} must be a whole number of 1 or more.`);
  return value;
}

/** Dollars (what the form shows) to cents (what we store). */
function dollarsToCents(raw: unknown, field: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new CouponInputError(`${field} must be 0 or more.`);
  return Math.round(value * 100);
}

export function validateCouponInput(body: Record<string, unknown>): CouponInput {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code)) {
    throw new CouponInputError("Code: 3–24 letters, digits or dashes.");
  }

  const kind = String(body.kind ?? "") as CouponKind;
  if (!(COUPON_KINDS as readonly string[]).includes(kind)) {
    throw new CouponInputError(`Kind must be one of: ${COUPON_KINDS.join(", ")}.`);
  }

  let value = 0;
  if (kind === "percent") {
    value = Number(body.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new CouponInputError("A percentage coupon must be between 1 and 100.");
    }
  } else if (kind === "fixed") {
    value = dollarsToCents(body.value, "Amount");
    if (value < 1) throw new CouponInputError("A fixed coupon must be worth more than $0.");
  }

  const description = String(body.description ?? "").trim().slice(0, 200);
  if (description.length < 3) throw new CouponInputError("Describe the offer so the buyer sees what it is.");

  const startsAt = optionalDate(body.startsAt, "Start date");
  const expiresAt = optionalDate(body.expiresAt, "End date");
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new CouponInputError("The end date must be after the start date.");
  }

  const allowedTiers = Array.isArray(body.allowedTiers) ? body.allowedTiers.map((tier) => String(tier)) : [];
  for (const tier of allowedTiers) {
    if (!(ACCOUNT_TIERS as readonly string[]).includes(tier)) throw new CouponInputError(`Unknown account tier "${tier}".`);
  }

  return {
    code,
    kind,
    value,
    minSubtotal: dollarsToCents(body.minSubtotal ?? 0, "Minimum subtotal"),
    description,
    active: body.active === undefined ? true : Boolean(body.active),
    startsAt,
    expiresAt,
    maxRedemptions: optionalCount(body.maxRedemptions, "Total redemption limit"),
    perCustomerLimit: optionalCount(body.perCustomerLimit, "Per-customer limit"),
    allowedTiers: [...new Set(allowedTiers)],
    stackable: body.stackable === undefined ? true : Boolean(body.stackable),
  };
}
