import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, eq, ilike, or } from "drizzle-orm";
import { BadgeCheck, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Lock, PackageSearch, SlidersHorizontal, X } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CatalogSkeleton } from "@/components/CatalogSkeleton";
import { ProductCard } from "@/components/ProductCard";
import { cachedBrands, cachedCategoryCounts, shopList, SHOP_PAGE_SIZE, type ShopPage } from "@/lib/catalog-cache";
import { pageRange, pageWindow } from "@/lib/pagination";
import { CATEGORIES } from "@/lib/site";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { toCardProduct } from "@/lib/catalog-view";

type SearchParams = {
  category?: string;
  brand?: string;
  q?: string;
  sort?: string;
  price?: string;
  stock?: string;
  cert?: string;
  page?: string;
};

const TITLE = "Wholesale catalog · case pricing";
const DESCRIPTION =
  "Browse every Ciputra Corp. wholesale SKU: supplements, pantry staples and home goods with case pricing, dimensional weight and volume tiers.";

/**
 * UX-5: every view carries its own canonical, so a filtered or paged grid no longer points
 * search engines at the home page. A search result set is a visitor's query, not a page worth
 * indexing — those are noindex, and the canonical still names the catalogue itself.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const category = CATEGORIES.find((entry) => entry.key === params.category);
  const page = pageNumber(params.page);
  const search = (params.q ?? "").trim();

  const canonical = new URLSearchParams();
  if (category) canonical.set("category", category.key);
  if (page > 1) canonical.set("page", String(page));
  const query = canonical.toString();

  return {
    title: category ? `${category.name} · wholesale case pricing` : TITLE,
    description: category ? category.blurb : DESCRIPTION,
    alternates: { canonical: query ? `/shop?${query}` : "/shop" },
    robots: search ? { index: false, follow: true } : undefined,
  };
}

function pageNumber(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, 10_000) : 1;
}

const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Case price ↑" },
  { key: "price-desc", label: "Case price ↓" },
  { key: "newest", label: "Newest" },
];

const PRICE_BANDS = [
  { key: "under-75", label: "Under $75 / case", min: 0, max: 7500 },
  { key: "75-150", label: "$75 – $150 / case", min: 7500, max: 15000 },
  { key: "over-150", label: "$150+ / case", min: 15000, max: 10_000_000 },
];

function buildHref(current: SearchParams, patch: Partial<SearchParams>) {
  const params = new URLSearchParams();
  // Any change but paging itself starts again at page one: page 7 of the old filter is not
  // page 7 of the new one.
  const next = { ...current, ...("page" in patch ? {} : { page: undefined }), ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== "all") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const viewer = await getSessionUser();
  // Price filters and price sorting would reveal wholesale prices by ordering, so they are trade-only.
  const showPrices = canSeePrices(viewer);
  const sorts = showPrices ? SORTS : SORTS.filter((item) => !item.key.startsWith("price"));
  const category = params.category && CATEGORIES.some((c) => c.key === params.category) ? params.category : undefined;
  const q = (params.q ?? "").trim().slice(0, 80);
  const sort = sorts.some((item) => item.key === params.sort) ? params.sort! : "featured";
  const band = showPrices ? PRICE_BANDS.find((item) => item.key === params.price) : undefined;
  const inStockOnly = params.stock === "in";

  const brand = (params.brand ?? "").trim().slice(0, 80) || undefined;
  const certifiedOnly = params.cert === "on";
  const page = pageNumber(params.page);

  if (q) {
    // An exact SKU, UPC/GTIN, ASIN or MPN goes straight to the product (scanner and buyer-sheet lookups).
    const code = q.replace(/[\s-]/g, "").toUpperCase();
    if (code.length >= 3) {
      const [exact] = await db
        .select({ slug: products.slug })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            or(eq(products.sku, q.toUpperCase()), eq(products.gtin, code), eq(products.caseGtin, code), eq(products.asin, code), ilike(products.mpn, q)),
          ),
        )
        .limit(2);
      if (exact) redirect(`/products/${exact.slug}`);
    }
  }

  const view: CatalogView = {
    params,
    showPrices,
    viewer: Boolean(viewer),
    sorts,
    category,
    q,
    sort,
    band,
    inStockOnly,
    brand,
    certifiedOnly,
    page,
  };

  return (
    <div className="border-t border-ink/10">
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-10 lg:py-12">
          <nav className="text-[10.5px] font-semibold tracking-[0.1em] text-ink/65 uppercase">
            <Link href="/" className="hover:text-ink">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-ink/70">Wholesale catalog</span>
          </nav>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="display text-[34px] leading-tight sm:text-[44px]">
                {category ? CATEGORIES.find((c) => c.key === category)?.name : "The wholesale catalog"}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink/72">
                {category
                  ? CATEGORIES.find((c) => c.key === category)?.blurb
                  : "Every SKU is case-packed with published weights and carton dimensions. Volume tiers resolve automatically; freight and destination tax are quoted before payment."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full border border-ink/15 bg-[#fffdf8] px-3 py-1.5">
                Case-packed · FOB Paterson
              </span>
              <span className="rounded-full border border-ink/15 bg-[#fffdf8] px-3 py-1.5">
                Freight &amp; destination tax quoted at checkout
              </span>
            </div>
          </div>
        </div>
      </section>

      {/*
        UX-4: the catalogue's queries are suspended, not the page. A route-level loading.tsx
        would flush the shell with status 200 before this component runs, and the exact-SKU
        redirect above would stop being a 307.
      */}
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogBody view={view} />
      </Suspense>
    </div>
  );
}

type CatalogView = {
  params: SearchParams;
  showPrices: boolean;
  viewer: boolean;
  sorts: { key: string; label: string }[];
  category?: string;
  q: string;
  sort: string;
  band?: { key: string; label: string; min: number; max: number };
  inStockOnly: boolean;
  brand?: string;
  certifiedOnly: boolean;
  page: number;
};

async function CatalogBody({ view }: { view: CatalogView }) {
  const { params, showPrices, viewer, sorts, category, q, sort, band, inStockOnly, brand, certifiedOnly, page } = view;

  // The layout seeds in parallel with the page, which on a cold demo database meant the grid
  // could be queried — and its empty answer cached for a minute — before the catalogue existed.
  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[shop] seed unavailable", error);
  }

  let grid: ShopPage = { rows: [], total: 0, page: 1, pages: 1 };
  let counts: { category: string; count: number }[] = [];
  let brands: { brand: string; count: number }[] = [];
  try {
    // One page at a time (UX-6). Without a search term the page comes from the shared data cache
    // (PRF-1); a search runs against the database so visitor input cannot fill the cache.
    [grid, counts, brands] = await Promise.all([
      shopList(
        {
          category: category ?? null,
          brand: brand ?? null,
          min: band?.min ?? null,
          max: band?.max ?? null,
          inStockOnly,
          certifiedOnly,
          sort,
          activeOnly: true,
        },
        q || null,
        page,
      ),
      cachedCategoryCounts(),
      cachedBrands(),
    ]);
  } catch (error) {
    console.error("[shop] catalog unavailable", error);
  }

  const list = grid.rows;
  const totalCount = counts.reduce((sum, row) => sum + row.count, 0);
  const countFor = (key: string) => counts.find((row) => row.category === key)?.count ?? 0;
  const range = pageRange(grid.page, SHOP_PAGE_SIZE, grid.total);
  const activeFilterCount =
    (category ? 1 : 0) + (q ? 1 : 0) + (band ? 1 : 0) + (inStockOnly ? 1 : 0) + (brand ? 1 : 0) + (certifiedOnly ? 1 : 0);

  return (
    <>
      <div className="wrap grid gap-8 py-8 lg:grid-cols-[240px_1fr] lg:py-10">
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase">
              <SlidersHorizontal size={13} /> Filters
            </p>
            {activeFilterCount > 0 ? (
              <Link href="/shop" className="flex items-center gap-1 text-[10.5px] font-semibold text-clay">
                <X size={11} /> Clear
              </Link>
            ) : null}
          </div>

          <div className="mt-5 border-t border-ink/10 pt-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/65 uppercase">Department</p>
            <div className="mt-2.5 space-y-0.5">
              <Link
                href={buildHref(params, { category: undefined })}
                className={`flex items-center justify-between rounded-md px-2.5 py-2 text-[12.5px] transition-colors ${
                  !category ? "bg-ink text-cream font-semibold" : "text-ink/70 hover:bg-ink/5"
                }`}
              >
                All departments
                <span className="text-[10.5px] opacity-60">{totalCount}</span>
              </Link>
              {CATEGORIES.map((item) => (
                <Link
                  key={item.key}
                  href={buildHref(params, { category: item.key })}
                  className={`flex items-center justify-between rounded-md px-2.5 py-2 text-[12.5px] transition-colors ${
                    category === item.key ? "bg-ink text-cream font-semibold" : "text-ink/70 hover:bg-ink/5"
                  }`}
                >
                  {item.shortName}
                  <span className="text-[10.5px] opacity-60">{countFor(item.key)}</span>
                </Link>
              ))}
            </div>
          </div>

          {showPrices ? (
          <div className="mt-5 border-t border-ink/10 pt-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/65 uppercase">Case price</p>
            <div className="mt-2.5 space-y-0.5">
              {PRICE_BANDS.map((item) => (
                <Link
                  key={item.key}
                  href={buildHref(params, { price: params.price === item.key ? undefined : item.key })}
                  className={`block rounded-md px-2.5 py-2 text-[12.5px] transition-colors ${
                    params.price === item.key ? "bg-ink text-cream font-semibold" : "text-ink/70 hover:bg-ink/5"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          ) : null}

          <div className="mt-5 border-t border-ink/10 pt-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/65 uppercase">Availability</p>
            <Link
              href={buildHref(params, { stock: inStockOnly ? undefined : "in" })}
              className="mt-2.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-ink/70 hover:bg-ink/5"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  inStockOnly ? "border-ink bg-ink text-cream" : "border-ink/25"
                }`}
              >
                {inStockOnly ? "✓" : ""}
              </span>
              In stock, ready to pick
            </Link>
          </div>

          {brands.length > 1 ? (
            <div className="mt-5 border-t border-ink/10 pt-5">
              <p className="text-[10px] font-bold tracking-[0.16em] text-ink/65 uppercase">Brand</p>
              <div className="mt-2.5 space-y-0.5">
                {brands.slice(0, 12).map((item) => (
                  <Link
                    key={item.brand}
                    href={buildHref(params, { brand: brand === item.brand ? undefined : item.brand })}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] transition-colors ${
                      brand === item.brand ? "bg-ink text-cream font-semibold" : "text-ink/70 hover:bg-ink/5"
                    }`}
                  >
                    <span className="truncate">{item.brand}</span>
                    <span className="text-[10.5px] opacity-60">{item.count}</span>
                  </Link>
                ))}
                {/* A brand picked from a search result may sit outside the first twelve. */}
                {brand && !brands.slice(0, 12).some((item) => item.brand === brand) ? (
                  <Link
                    href={buildHref(params, { brand: undefined })}
                    className="flex items-center justify-between gap-2 rounded-md bg-ink px-2.5 py-2 text-[12.5px] font-semibold text-cream"
                  >
                    <span className="truncate">{brand}</span>
                    <X size={11} />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-5 border-t border-ink/10 pt-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/65 uppercase">Certification</p>
            <Link
              href={buildHref(params, { cert: certifiedOnly ? undefined : "on" })}
              className="mt-2.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-ink/70 hover:bg-ink/5"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  certifiedOnly ? "border-ink bg-ink text-cream" : "border-ink/25"
                }`}
              >
                {certifiedOnly ? "✓" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <BadgeCheck size={13} className="text-fern" /> Certificate on file
              </span>
            </Link>
          </div>

          <div className="mt-5 rounded-lg border border-fern/20 bg-fern/5 p-4">
            <p className="text-[11.5px] font-bold text-fern">Need a freight estimate?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink/72">
              Add cases to the cart and enter a ZIP at checkout — parcel and LTL rates price
              automatically.
            </p>
            <Link href="/wholesale#freight" className="mt-2 inline-block text-[11px] font-bold underline">
              How freight works
            </Link>
          </div>
        </aside>

        <div>
          <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-bold tracking-[0.12em] text-ink/65 uppercase">Sort</span>
              {sorts.map((item) => (
                <Link
                  key={item.key}
                  href={buildHref(params, { sort: item.key })}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    sort === item.key
                      ? "border-ink bg-ink text-cream"
                      : "border-ink/15 text-ink/72 hover:border-ink/40"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[11.5px] text-ink/70">
                {q ? (
                  <>
                    Results for <span className="font-bold text-ink">“{q}”</span> ·{" "}
                  </>
                ) : null}
                {grid.total === 0
                  ? `0 of ${totalCount} SKUs`
                  : `${range.from}–${range.to} of ${grid.total}${grid.total === totalCount ? "" : " matching"} SKUs`}
              </p>
              {showPrices ? (
              <>
              <a
                href="/api/order-sheet/download?format=xlsx"
                download
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
              >
                <FileSpreadsheet size={12} /> Order sheet (.xlsx)
              </a>
              <a
                href="/api/order-sheet/download?format=csv"
                download
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
              >
                <Download size={12} /> CSV
              </a>
              </>
              ) : null}
            </div>
          </div>

          {!showPrices ? (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                  <Lock size={13} /> Wholesale prices are for approved trade accounts
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink/72">
                  {viewer
                    ? "Your account is not approved for wholesale yet. Apply once — most applications are decided within one business day."
                    : "Sign in to your trade account, or apply with your EIN and resale certificate."}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {viewer ? null : (
                  <Link href="/login?next=/shop" className="btn btn-outline btn-sm">Sign in</Link>
                )}
                <Link href="/wholesale/apply" className="btn btn-primary btn-sm">Apply for wholesale</Link>
              </div>
            </div>
          ) : null}

          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink/20 py-24 text-center">
              <PackageSearch size={30} className="text-ink/30" />
              <p className="display text-2xl">No cases match those filters</p>
              <p className="max-w-sm text-[12.5px] text-ink/70">
                Try clearing the search or the price band, or browse another department.
              </p>
              <Link href="/shop" className="btn btn-primary btn-sm mt-2">
                Reset catalog
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((product, index) => (
                  <ProductCard key={product.id} product={toCardProduct(product, showPrices)} index={index} />
                ))}
              </div>

              {/* UX-6: the grid is paged, so a thousand-SKU catalogue is a thousand SKUs on the
                  server and twenty-four in the browser. */}
              {grid.pages > 1 ? (
                <nav aria-label="Catalog pages" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-5">
                  <p className="text-[11.5px] text-ink/70">
                    Page {grid.page} of {grid.pages} · showing {range.from}–{range.to} of {grid.total}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {grid.page > 1 ? (
                      <Link
                        href={buildHref(params, { page: grid.page - 1 === 1 ? undefined : String(grid.page - 1) })}
                        rel="prev"
                        aria-label="Previous page"
                        className="flex items-center gap-1 rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold text-ink/72 hover:border-ink/40 hover:text-ink"
                      >
                        <ChevronLeft size={12} /> Prev
                      </Link>
                    ) : null}
                    {pageWindow(grid.page, grid.pages).map((entry, index) =>
                      entry === null ? (
                        <span key={`gap-${index}`} className="px-1 text-[11px] text-ink/50">
                          …
                        </span>
                      ) : entry === grid.page ? (
                        <span
                          key={entry}
                          aria-current="page"
                          className="rounded-full border border-ink bg-ink px-3 py-1.5 text-[11px] font-bold text-cream"
                        >
                          {entry}
                        </span>
                      ) : (
                        <Link
                          key={entry}
                          href={buildHref(params, { page: entry === 1 ? undefined : String(entry) })}
                          aria-label={`Page ${entry}`}
                          className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold text-ink/72 hover:border-ink/40 hover:text-ink"
                        >
                          {entry}
                        </Link>
                      ),
                    )}
                    {grid.page < grid.pages ? (
                      <Link
                        href={buildHref(params, { page: String(grid.page + 1) })}
                        rel="next"
                        aria-label="Next page"
                        className="flex items-center gap-1 rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold text-ink/72 hover:border-ink/40 hover:text-ink"
                      >
                        Next <ChevronRight size={12} />
                      </Link>
                    ) : null}
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}