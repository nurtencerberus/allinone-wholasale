import { unstable_cache as dataCache, revalidateTag } from "next/cache";
import { and, asc, desc, eq, gt, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
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
  brand: string | null;
  min: number | null;
  max: number | null;
  inStockOnly: boolean;
  /** Only SKUs with a certification document on file (UX-6). */
  certifiedOnly: boolean;
  sort: string;
  activeOnly: boolean;
};

/** UX-6: one page of the grid, never the whole catalogue. */
export const SHOP_PAGE_SIZE = 24;

/**
 * The text the search index is built on (see db/migrations/0014_product_search.sql). The query
 * and the index must agree word for word, or Postgres falls back to a scan.
 */
const SEARCH_DOCUMENT = sql`to_tsvector('english', coalesce(${products.name}, '') || ' ' || coalesce(${products.brand}, '') || ' ' || coalesce(${products.sku}, '') || ' ' || coalesce(${products.description}, ''))`;

const CERTIFIED = sql`exists (select 1 from jsonb_array_elements(${products.certifications}) as cert where cert->>'documentUrl' is not null)`;

function shopWhere(filters: ShopFilters, search: string | null): SQL | undefined {
  const where: (SQL | undefined)[] = [];
  if (filters.activeOnly) where.push(eq(products.active, true));
  if (filters.category) where.push(eq(products.category, filters.category));
  if (filters.brand) where.push(eq(products.brand, filters.brand));
  if (filters.min !== null) where.push(gte(products.casePrice, filters.min));
  if (filters.max !== null) where.push(lte(products.casePrice, filters.max));
  if (filters.inStockOnly) where.push(gt(products.stock, 0));
  if (filters.certifiedOnly) where.push(CERTIFIED);
  if (search) where.push(searchCondition(search));
  return where.length ? and(...where) : undefined;
}

/**
 * Full-text search over name, brand, SKU and description, plus a substring match on the trade
 * identifiers — a buyer who types half a GTIN or an MPN is not writing English, and those
 * columns are short enough to match without an index.
 */
function searchCondition(search: string): SQL {
  const code = search.replace(/[\s-]/g, "");
  return or(
    sql`${SEARCH_DOCUMENT} @@ websearch_to_tsquery('english', ${search})`,
    ilike(products.sku, `%${search}%`),
    ilike(products.gtin, `%${code}%`),
    ilike(products.caseGtin, `%${code}%`),
    ilike(products.asin, `%${code}%`),
    ilike(products.mpn, `%${search}%`),
  )!;
}

function shopOrder(filters: ShopFilters, search: string | null) {
  if (search) {
    // Relevance first when there is a term to be relevant to.
    return [desc(sql`ts_rank(${SEARCH_DOCUMENT}, websearch_to_tsquery('english', ${search}))`), asc(products.name)];
  }
  return filters.sort === "price-asc"
    ? [asc(products.casePrice)]
    : filters.sort === "price-desc"
      ? [desc(products.casePrice)]
      : filters.sort === "newest"
        ? [desc(products.createdAt)]
        : [desc(products.featured), asc(products.name)];
}

export type ShopPage = { rows: Product[]; total: number; page: number; pages: number };

async function shopQuery(filters: ShopFilters, search: string | null, page: number): Promise<ShopPage> {
  const where = shopWhere(filters, search);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(where);
  const pages = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(...shopOrder(filters, search))
    .limit(SHOP_PAGE_SIZE)
    .offset((current - 1) * SHOP_PAGE_SIZE);
  return { rows, total, page: current, pages };
}

const cachedShopListInner = dataCache(
  async (filters: ShopFilters, page: number): Promise<ShopPage> => shopQuery(filters, null, page),
  ["catalog-shop"],
  options,
);

/**
 * The shop grid, one page at a time. A free-text search is **not** cached: the query string is
 * visitor input and would fill the cache with one entry per search.
 */
export async function shopList(filters: ShopFilters, search: string | null, page = 1): Promise<ShopPage> {
  if (search) return shopQuery(filters, search, page);
  return cachedShopListInner(filters, page);
}

/** Brands with at least one active SKU, for the brand facet. */
export const cachedBrands = dataCache(
  async (): Promise<{ brand: string; count: number }[]> =>
    db
      .select({ brand: products.brand, count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.active, true))
      .groupBy(products.brand)
      .orderBy(asc(products.brand)),
  ["catalog-brands"],
  options,
);

export type PriceListRow = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  caseSize: number;
  casePrice: number;
  priceTiers: { minCases: number; casePrice: number }[];
  msrpUnit: number;
  stock: number;
  weightOz: number;
  slug: string;
};

/**
 * The home page's price list (UX-6). Only the columns the table shows — the full rows carry the
 * description, cost price and supplier fields, and this list is handed to a client component.
 */
export const cachedPriceList = dataCache(
  async (limit: number): Promise<PriceListRow[]> =>
    db
      .select({
        sku: products.sku,
        name: products.name,
        brand: products.brand,
        category: products.category,
        caseSize: products.caseSize,
        casePrice: products.casePrice,
        priceTiers: products.priceTiers,
        msrpUnit: products.msrpUnit,
        stock: products.stock,
        weightOz: products.weightOz,
        slug: products.slug,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name))
      .limit(limit),
  ["catalog-price-list"],
  options,
);

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
    // `{ expire: 0 }` makes the tagged entries unusable from this moment. A named profile such
    // as "max" would only mark them stale and keep serving the old rows while refreshing in the
    // background — an admin save has to show up at once, not on the next read but one.
    revalidateTag(CATALOG_TAG, { expire: 0 });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: "warn", alert: "catalog-revalidate", message: String(error) }));
  }
}
