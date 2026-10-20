import { and, asc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, orders, products, users } from "@/db/schema";
import type { CartItemInput } from "@/lib/checkout";
import { MAX_CASES_PER_LINE } from "@/lib/checkout";

/**
 * The signed-in buyer's cart on the server (SEP-7): it follows them from the laptop to the
 * warehouse tablet, survives a cleared browser, and gives the nightly job something to remind
 * them about. Guests still keep their cart in local storage alone.
 */

/** Days a cart may sit untouched before the buyer gets one reminder. */
export const CART_REMINDER_DAYS = 3;
/** Carts older than this are not worth a reminder any more. */
export const CART_REMINDER_MAX_DAYS = 30;

/** Merge duplicates, drop nonsense, and cap each line the way priceCart would. */
export function cleanCartItems(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<number, number>();
  for (const item of items ?? []) {
    const productId = Number(item?.productId);
    const cases = Number(item?.cases);
    if (!Number.isInteger(productId) || productId < 1) continue;
    if (!Number.isFinite(cases) || cases <= 0) continue;
    merged.set(productId, Math.min(MAX_CASES_PER_LINE, (merged.get(productId) ?? 0) + Math.ceil(cases)));
  }
  return [...merged].map(([productId, cases]) => ({ productId, cases }));
}

/**
 * What the buyer should see after signing in on a second device: the larger quantity of each
 * line, never the sum. Summing would double a cart that simply synced from this same device.
 */
export function mergeCartItems(stored: CartItemInput[], incoming: CartItemInput[]): CartItemInput[] {
  const result = new Map<number, number>();
  for (const item of cleanCartItems(stored)) result.set(item.productId, item.cases);
  for (const item of cleanCartItems(incoming)) {
    result.set(item.productId, Math.max(result.get(item.productId) ?? 0, item.cases));
  }
  return [...result]
    .map(([productId, cases]) => ({ productId, cases }))
    .sort((a, b) => a.productId - b.productId);
}

export async function loadCart(userId: number): Promise<CartItemInput[]> {
  const rows = await db
    .select({ productId: cartItems.productId, cases: cartItems.cases })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(eq(carts.userId, userId))
    .orderBy(asc(cartItems.productId));
  return rows;
}

/** Replaces the stored cart with exactly these lines. An empty list empties the cart. */
export async function saveCart(userId: number, items: CartItemInput[]): Promise<CartItemInput[]> {
  const wanted = cleanCartItems(items);
  await db.transaction(async (tx) => {
    const [cart] = await tx
      .insert(carts)
      .values({ userId })
      .onConflictDoUpdate({ target: carts.userId, set: { updatedAt: new Date(), remindedAt: null } })
      .returning({ id: carts.id });

    if (!wanted.length) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      return;
    }
    // Only products that still exist may be stored; the foreign key would reject the rest.
    const live = await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, wanted.map((item) => item.productId)));
    const liveIds = new Set(live.map((row) => row.id));
    const rows = wanted.filter((item) => liveIds.has(item.productId));

    await tx.delete(cartItems).where(
      rows.length
        ? and(eq(cartItems.cartId, cart.id), notInArray(cartItems.productId, rows.map((row) => row.productId)))
        : eq(cartItems.cartId, cart.id),
    );
    for (const row of rows) {
      await tx
        .insert(cartItems)
        .values({ cartId: cart.id, productId: row.productId, cases: row.cases })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId],
          set: { cases: row.cases },
        });
    }
  });
  return loadCart(userId);
}

/** Sign-in: fold whatever the browser was carrying into the stored cart and return the result. */
export async function mergeIntoCart(userId: number, incoming: CartItemInput[]): Promise<CartItemInput[]> {
  const stored = await loadCart(userId);
  const merged = mergeCartItems(stored, incoming);
  if (!merged.length) return [];
  return saveCart(userId, merged);
}

export type AbandonedCart = {
  userId: number;
  email: string;
  name: string;
  cartId: number;
  lines: { name: string; sku: string; cases: number }[];
};

/**
 * Carts left untouched for a few days by a verified buyer who has not ordered since. One
 * reminder per cart: `reminded_at` is cleared whenever the cart changes again.
 */
export async function abandonedCarts(limit = 50): Promise<AbandonedCart[]> {
  const now = Date.now();
  const stale = new Date(now - CART_REMINDER_DAYS * 24 * 60 * 60 * 1000);
  const tooOld = new Date(now - CART_REMINDER_MAX_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ cartId: carts.id, userId: users.id, email: users.email, name: users.name, updatedAt: carts.updatedAt })
    .from(carts)
    .innerJoin(users, eq(users.id, carts.userId))
    .where(
      and(
        isNull(carts.remindedAt),
        lt(carts.updatedAt, stale),
        sql`${carts.updatedAt} > ${tooOld}`,
        eq(users.emailVerified, true),
        sql`exists (select 1 from ${cartItems} where ${cartItems.cartId} = ${carts.id})`,
        sql`not exists (select 1 from ${orders} where ${orders.userId} = ${users.id} and ${orders.createdAt} > ${carts.updatedAt})`,
      ),
    )
    .limit(limit);

  const result: AbandonedCart[] = [];
  for (const row of rows) {
    const lines = await db
      .select({ name: products.name, sku: products.sku, cases: cartItems.cases })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(and(eq(cartItems.cartId, row.cartId), eq(products.active, true)))
      .orderBy(asc(products.name));
    if (lines.length) result.push({ userId: row.userId, email: row.email, name: row.name, cartId: row.cartId, lines });
  }
  return result;
}

export async function markCartReminded(cartId: number): Promise<void> {
  await db.update(carts).set({ remindedAt: new Date() }).where(eq(carts.id, cartId));
}

/** The order is placed: the cart it came from is done. */
export async function clearCart(userId: number): Promise<void> {
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!cart) return;
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  await db.update(carts).set({ updatedAt: new Date(), remindedAt: null }).where(eq(carts.id, cart.id));
}
