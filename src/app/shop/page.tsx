import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, gte, ilike, lte, or, sql } from "drizzle-orm";
import { Download, FileSpreadsheet, Lock, PackageSearch, SlidersHorizontal, X } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ProductCard } from "@/components/ProductCard";
import { CATEGORIES } from "@/lib/site";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { toCardProduct } from "@/lib/catalog-view";

type SearchParams = {
  category?: string;
  q?: string;
  sort?: string;
  price?: string;
  stock?: string;
};

export const metadata = {
  title: "Wholesale catalog · case pricing",
  description:
    "Browse every Ciputra Corp. wholesale SKU: supplements, pantry staples and home goods with case pricing, dimensional weight and volume tiers.",
  alternates: { canonical: "/shop" },
};

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
  const next = { ...current, ...patch };
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

  const filters = [eq(products.active, true)];
  if (category) filters.push(eq(products.category, category));
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
    filters.push(
      or(
        ilike(products.name, `%${q}%`),
        ilike(products.sku, `%${q}%`),
        ilike(products.description, `%${q}%`),
        ilike(products.brand, `%${q}%`),
        ilike(products.gtin, `%${code}%`),
        ilike(products.asin, `%${code}%`),
        ilike(products.mpn, `%${q}%`),
      )!,
    );
  }
  if (band) {
    filters.push(gte(products.casePrice, band.min));
    filters.push(lte(products.casePrice, band.max));
  }
  if (inStockOnly) filters.push(gt(products.stock, 0));

  const orderBy =
    sort === "price-asc"
      ? [asc(products.casePrice)]
      : sort === "price-desc"
        ? [desc(products.casePrice)]
        : sort === "newest"
          ? [desc(products.createdAt)]
          : [desc(products.featured), asc(products.name)];

  let list: (typeof products.$inferSelect)[] = [];
  let counts: { category: string; count: number }[] = [];
  try {
    list = await db
      .select()
      .from(products)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(...orderBy);
    counts = await db
      .select({ category: products.category, count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.active, true))
      .groupBy(products.category);
  } catch (error) {
    console.error("[shop] catalog unavailable", error);
  }

  const totalCount = counts.reduce((sum, row) => sum + row.count, 0);
  const countFor = (key: string) => counts.find((row) => row.category === key)?.count ?? 0;
  const activeFilterCount =
    (category ? 1 : 0) + (q ? 1 : 0) + (band ? 1 : 0) + (inStockOnly ? 1 : 0);

  return (
    <div className="border-t border-ink/10">
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-10 lg:py-12">
          <nav className="text-[10.5px] font-semibold tracking-[0.1em] text-ink/40 uppercase">
            <Link href="/" className="hover:text-ink">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-ink/70">Wholesale catalog</span>
          </nav>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="display text-[34px] leading-tight sm:text-[44px]">
                {category ? CATEGORIES.find((c) => c.key === category)?.name : "The wholesale catalog"}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink/60">
                {category
                  ? CATEGORIES.find((c) => c.key === category)?.blurb
                  : "Every SKU is case-packed with published weights and carton dimensions. Volume tiers resolve automatically; freight and destination tax are quoted before payment."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full border border-ink/15 bg-[#fffdf8] px-3 py-1.5">
                {list.length} of {totalCount} SKUs
              </span>
              <span className="rounded-full border border-ink/15 bg-[#fffdf8] px-3 py-1.5">
                Case-packed · FOB Paterson
              </span>
            </div>
          </div>
        </div>
      </section>

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
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/45 uppercase">Department</p>
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
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/45 uppercase">Case price</p>
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
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/45 uppercase">Availability</p>
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

          <div className="mt-5 rounded-lg border border-fern/20 bg-fern/5 p-4">
            <p className="text-[11.5px] font-bold text-fern">Need a freight estimate?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink/60">
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
              <span className="text-[10.5px] font-bold tracking-[0.12em] text-ink/40 uppercase">Sort</span>
              {sorts.map((item) => (
                <Link
                  key={item.key}
                  href={buildHref(params, { sort: item.key })}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    sort === item.key
                      ? "border-ink bg-ink text-cream"
                      : "border-ink/15 text-ink/60 hover:border-ink/40"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {q ? (
                <p className="text-[11.5px] text-ink/55">
                  Results for <span className="font-bold text-ink">“{q}”</span>
                </p>
              ) : null}
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
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink/60">
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
              <p className="max-w-sm text-[12.5px] text-ink/55">
                Try clearing the search or the price band, or browse another department.
              </p>
              <Link href="/shop" className="btn btn-primary btn-sm mt-2">
                Reset catalog
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((product, index) => (
                <ProductCard key={product.id} product={toCardProduct(product, showPrices)} index={index} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
