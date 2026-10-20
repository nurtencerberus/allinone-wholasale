import { unstable_cache as dataCache, revalidateTag } from "next/cache";
import { and, asc, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";

/**
 * PRF-1: the catalogue queries every page used to run on every request, kept in the data cache
 * instead and shared across visitors.
 *
 * What is cached is the **product rows**, never rendered HTML. That matters: the catalogue looks
 * different to a guest and to an approved trade account, so a shared HTML cache could hand
 * wholesale prices to someone who may not see them. Rows are the same for everyone; the price
 * lock stays where it belongs, in `toCardProduct()` / `canSeePrices()` at render time.
 *
 * Freshness: `CATALOG_TAG` is invalidated whenever a product, the catalogue import or stock
 * changes, and every entry also expires on its own after `CATALOG_TTL_SECONDS`. Stock shown from
 * a slightly stale row is cosmetic — `priceCart()` and `createOrderRecord()` re-check it against
 * the live lots before any money moves.
 */
export const CATALOG_TAG = "catalog";
const CATALOG_TTL_SECONDS = 60;

const options = { tags: [CATALOG_TAG], revalidate: CATALOG_TTL_SECONDS };

/** Products for the home page's hero row: featured first, newest of those first. */
export const cachedFeatured = dataCache(
  async (limit: number): Promise<Product[]> => {
    const featured = await db
      .select()
      .from(products)
      .where(and(eq(products.featured, true), eq(products.active, true)))
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(limit);
    if (featured.length) return featured;
    return db.select().from(products).where(eq(products.active, true)).limit(limit);
  },
  ["catalog-featured"],
  options,
);

/** Every active product, category then name: the price list, quick order and the order sheet. */
export const cachedActiveCatalog = dataCache(
  async (): Promise<Product[]> =>
    db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name)),
  ["catalog-active"],
  options,
);

export const cachedCategoryCounts = dataCache(
  async (): Promise<{ category: string; count: number }[]> =>
    db
      .select({ category: products.category, count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.active, true))
      .groupBy(products.category),
  ["catalog-counts"],
  options,
);

export type ShopFilters = {
  category: string | null;
  min: number | null;
  max: number | null;
  inStockOnly: boolean;
  sort: string;
  activeOnly: boolean;
};

function shopQuery(filters: ShopFilters) {
  const where = [];
  if (filters.activeOnly) where.push(eq(products.active, true));
  if (filters.category) where.push(eq(products.category, filters.category));
  if (filters.min !== null) where.push(gte(products.casePrice, filters.min));
  if (filters.max !== null) where.push(lte(products.casePrice, filters.max));
  if (filters.inStockOnly) where.push(gt(products.stock, 0));

  const orderBy =
    filters.sort === "price-asc"
      ? [asc(products.casePrice)]
      : filters.sort === "price-desc"
        ? [desc(products.casePrice)]
        : filters.sort === "newest"
          ? [desc(products.createdAt)]
          : [desc(products.featured), asc(products.name)];

  return db
    .select()
    .from(products)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy);
}

const cachedShopListInner = dataCache(
  async (filters: ShopFilters): Promise<Product[]> => shopQuery(filters),
  ["catalog-shop"],
  options,
);

/**
 * The shop grid. A free-text search is **not** cached: the query string is visitor input and
 * would fill the cache with one entry per search. Those run against the database as before.
 */
export async function shopList(filters: ShopFilters, search: string | null): Promise<Product[]> {
  if (search) return shopQuery(filters);
  return cachedShopListInner(filters);
}

export const cachedProductBySlug = dataCache(
  async (slug: string): Promise<Product | null> => {
    const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
    return product ?? null;
  },
  ["catalog-product"],
  options,
);

export const cachedRelated = dataCache(
  async (category: string, excludeId: number, limit: number): Promise<Product[]> =>
    db
      .select()
      .from(products)
      .where(and(eq(products.category, category), eq(products.active, true), sql`${products.id} <> ${excludeId}`))
      .limit(limit),
  ["catalog-related"],
  options,
);

/**
 * Something about the catalogue or stock changed: drop the cached rows. Safe to call from a
 * route handler or a server action; it never throws into the caller's path.
 */
export function revalidateCatalog(): void {
  try {
    // "max" expires every entry carrying the tag, however fresh it is (Next 16 signature).
    revalidateTag(CATALOG_TAG, "max");
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: "warn", alert: "catalog-revalidate", message: String(error) }));
  }
}
