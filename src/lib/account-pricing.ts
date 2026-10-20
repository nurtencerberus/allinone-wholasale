import { and, eq, inArray, isNull, lte, or, gt } from "drizzle-orm";
import { db } from "@/db";
import { accountPrices, type AccountPrice } from "@/db/schema";

/**
 * UX-7: negotiated prices for one trade account.
 *
 * A contract price **replaces** the catalogue and tier price for that buyer; the account's
 * percentage discount is not applied on top of it. Two discounts on a price that was already
 * negotiated is how a trade desk loses margin without noticing, so the rule is: whichever the
 * buyer gets, they get it once. The quote and the order both go through `priceCart()`, so a
 * contract price can never be claimed by the browser — it is read from the database every time.
 */

export type ContractPrice = { casePrice: number; minCases: number | null };
/** productId → the price this account has agreed for it, today. */
export type ContractPrices = Map<number, ContractPrice>;

export const NO_CONTRACT_PRICES: ContractPrices = new Map();

/** Rows that are in force right now (an open-ended window counts as in force). */
function live(rows: AccountPrice[], now: Date): AccountPrice[] {
  return rows.filter(
    (row) => (!row.startsAt || row.startsAt <= now) && (!row.expiresAt || row.expiresAt > now),
  );
}

/** Every price in force for this account, optionally narrowed to the products in a cart. */
export async function contractPricesFor(
  userId: number | null | undefined,
  productIds?: number[],
): Promise<ContractPrices> {
  if (!userId) return NO_CONTRACT_PRICES;
  if (productIds && !productIds.length) return NO_CONTRACT_PRICES;

  const now = new Date();
  const rows = await db
    .select()
    .from(accountPrices)
    .where(
      and(
        eq(accountPrices.userId, userId),
        productIds ? inArray(accountPrices.productId, productIds) : undefined,
        or(isNull(accountPrices.startsAt), lte(accountPrices.startsAt, now)),
        or(isNull(accountPrices.expiresAt), gt(accountPrices.expiresAt, now)),
      ),
    );

  return new Map(
    live(rows, now).map((row) => [row.productId, { casePrice: row.casePrice, minCases: row.minCases }]),
  );
}

/** Everything the trade desk sees on an account's price list, in force or not. */
export async function allAccountPrices(userId: number): Promise<AccountPrice[]> {
  return db.select().from(accountPrices).where(eq(accountPrices.userId, userId));
}
