// Client-safe access rules (no database or cookie imports), shared by server and browser code.
import { isStaffRole } from "@/lib/staff";

/** Customer account tiers; "wholesale" is the approved trade account. */
export const ACCOUNT_TIERS = ["retail", "wholesale"] as const;
export type AccountTier = (typeof ACCOUNT_TIERS)[number];

type PriceViewer = { role: string; accountTier: string };

/**
 * Wholesale prices, the cart, quick order and checkout are open only to approved trade
 * accounts (and staff). Enforce this on the server — never only by hiding UI.
 */
export function canSeePrices<T extends PriceViewer>(user: T | null | undefined): user is T {
  return Boolean(user && (isStaffRole(user.role) || user.accountTier === "wholesale"));
}

export const PRICE_LOCKED_MESSAGE =
  "Wholesale pricing and ordering are available to approved trade accounts. Sign in or apply for a trade account.";
