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

export type PricedAccount = { id: number; companyId?: number | null } | null | undefined;

/**
 * Every price in force for this buyer, optionally narrowed to the products in a cart. A member
 * of a company account also gets the company's prices (UX-7); a price agreed with the person
 * directly wins over the company's for that SKU.
 */
export async function contractPricesFor(account: PricedAccount, productIds?: number[]): Promise<ContractPrices> {
  const userId = account?.id;
  const companyId = account?.companyId ?? null;
  if (!userId) return NO_CONTRACT_PRICES;
  if (productIds && !productIds.length) return NO_CONTRACT_PRICES;

  const now = new Date();
  const rows = await db
    .select()
    .from(accountPrices)
    .where(
      and(
        companyId ? or(eq(accountPrices.userId, userId), eq(accountPrices.companyId, companyId)) : eq(accountPrices.userId, userId),
        productIds ? inArray(accountPrices.productId, productIds) : undefined,
        or(isNull(accountPrices.startsAt), lte(accountPrices.startsAt, now)),
        or(isNull(accountPrices.expiresAt), gt(accountPrices.expiresAt, now)),
      ),
    );

  const result: ContractPrices = new Map();
  for (const row of live(rows, now)) {
    // The company price is the floor everyone shares; a price agreed with this person wins.
    const mine = row.userId === userId;
    if (!result.has(row.productId) || mine) {
      result.set(row.productId, { casePrice: row.casePrice, minCases: row.minCases });
    }
  }
  return result;
}

/** Everything the trade desk sees on an account's price list, in force or not. */
export async function allAccountPrices(userId: number): Promise<AccountPrice[]> {
  return db.select().from(accountPrices).where(eq(accountPrices.userId, userId));
}
