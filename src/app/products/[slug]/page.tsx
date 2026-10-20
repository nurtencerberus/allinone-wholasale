import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { AlertTriangle, Boxes, CalendarCheck, ExternalLink, FileCheck2, Lock, MapPin, Package, Ruler, Star, Truck } from "lucide-react";
import { db } from "@/db";
import { productLots, products, reviews } from "@/db/schema";
import { ProductGallery } from "@/components/product/ProductGallery";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductCard } from "@/components/ProductCard";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { toCardProduct } from "@/lib/catalog-view";
import { categoryName, jsonLdHtml, SITE } from "@/lib/site";
import { formatDate, formatIsoDate, formatMoney, unitPriceOf } from "@/lib/money";
import { addDays, EXPIRY_PULL_DAYS, isoDate } from "@/lib/inventory";
import { amazonUrl, FDA_DISCLAIMER, regionName } from "@/lib/product-data";
import { ozToLbs } from "@/lib/weight";

/**
 * One row per request: generateMetadata and the page itself both need the product, and React's
 * cache() keeps that a single query instead of two (PRF-3).
 */
const productBySlug = cache(async (slug: string) => {
  const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return product ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const product = await productBySlug(slug);
    if (!product || !product.active) {
      return { title: "Product not found", robots: { index: false, follow: false } };
    }
    return {
      title: product.seoTitle || `${product.name} — wholesale case of ${product.caseSize}`,
      description: product.seoDescription || `${product.tagline}. ${product.description.slice(0, 150)}…`,
      alternates: { canonical: `/products/${product.slug}` },
      openGraph: {
        title: `${product.name} · wholesale`,
        description: product.tagline,
        images: [{ url: product.image }],
        type: "website",
      },
    };
  } catch {
    return { title: "Wholesale catalog" };
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await productBySlug(slug);
  if (!product) notFound();

  const [productReviews, related, user, nextLot] = await Promise.all([
    db.select().from(reviews).where(eq(reviews.productId, product.id)).orderBy(desc(reviews.createdAt)),
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.category, product.category),
          ne(products.id, product.id),
          eq(products.active, true),
        ),
      )
      .limit(3),
    getSessionUser(),
    // The lot an order would ship from next (FEFO), for the "best by" promise.
    db
      .select({ expiresOn: productLots.expiresOn })
      .from(productLots)
      .where(
        and(
          eq(productLots.productId, product.id),
          eq(productLots.status, "available"),
          gt(productLots.qtyOnHand, 0),
          or(isNull(productLots.expiresOn), gt(productLots.expiresOn, isoDate(addDays(new Date(), EXPIRY_PULL_DAYS)))),
        ),
      )
      .orderBy(sql`${productLots.expiresOn} asc nulls last`)
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  // Archived products are hidden from the public store; admins can still preview them.
  const archivedPreview = !product.active;
  if (archivedPreview && !hasPermission(user, "view")) notFound();
  // Ratings come only from review rows that exist; no stored or imported score is ever shown.
  const hasReviews = productReviews.length > 0;
  const showPrices = canSeePrices(user);
  const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${SITE.domain}${url}`);

  const dimWeight = (product.dimensions.l * product.dimensions.w * product.dimensions.h) / 139;
  const caseWeightLbs = ozToLbs(product.weightOz);
  const billable = Math.max(caseWeightLbs, Math.round(dimWeight * 10) / 10);
  const palletised = billable >= 150 || caseWeightLbs >= 40;
  const averageRating = hasReviews
    ? productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length
    : 0;
  const wholesaleApproved = user?.accountTier === "wholesale";
  const country = regionName(product.countryOfOrigin);
  const originLabel = product.origin || country;
  // Amazon is a comparison reference for trade buyers only; guests are not sent off-site.
  const amazonLink = showPrices ? amazonUrl(product.asin) : null;
  const documentedCerts = product.certifications.filter((cert) => cert.documentUrl);
  const buyBoxProduct = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    image: product.image,
    caseSize: product.caseSize,
    msrpUnit: product.msrpUnit,
    minCases: product.minCases,
    category: product.category,
    weightOz: product.weightOz,
    casePrice: product.casePrice,
    priceTiers: product.priceTiers,
    stock: product.stock,
  };
  const labelFacts = [
    product.gtin ? { label: "UPC / GTIN", value: product.gtin } : null,
    product.caseGtin ? { label: "Case GTIN (ITF-14)", value: product.caseGtin } : null,
    product.mpn ? { label: "Manufacturer part no.", value: product.mpn } : null,
    product.manufacturer ? { label: "Manufacturer", value: product.manufacturer } : null,
    country ? { label: "Country of origin", value: country } : null,
    product.shelfLifeDays ? { label: "Shelf life from manufacture", value: `${product.shelfLifeDays} days` } : null,
    nextLot?.expiresOn ? { label: "Ships with best-by", value: `${formatIsoDate(nextLot.expiresOn, "month")} or later` } : null,
    product.unitsPerPallet
      ? { label: "Pallet", value: `${product.unitsPerPallet} cases${product.palletTi && product.palletHi ? ` (${product.palletTi} × ${product.palletHi})` : ""}` }
      : null,
    product.freightClass ? { label: "Freight class", value: product.freightClass } : null,
    product.hazmat ? { label: "Hazardous material", value: product.unNumber ?? "Yes" } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const descriptionParagraphs = product.description.split("\n\n");

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    image: Array.from(new Set([product.image, ...product.images].filter(Boolean).map(absolute))),
    description: product.description.replace(/\n/g, " "),
    brand: { "@type": "Brand", name: product.brand },
    category: categoryName(product.category),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(country ? { countryOfOrigin: { "@type": "Country", name: country } } : {}),
    // Google rejects an AggregateRating without reviews, so new products omit it.
    ...(hasReviews
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(averageRating.toFixed(1)),
            reviewCount: productReviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    review: productReviews.slice(0, 3).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.author },
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5 },
      name: review.title,
      reviewBody: review.body,
      datePublished: new Date(review.createdAt).toISOString().slice(0, 10),
    })),
  };

  // No Offer: wholesale prices are not public, and an Offer without a price is invalid.
  const publishedJsonLd = productJsonLd;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.domain },
      { "@type": "ListItem", position: 2, name: "Wholesale catalog", item: `${SITE.domain}/shop` },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryName(product.category),
        item: `${SITE.domain}/shop?category=${product.category}`,
      },
      { "@type": "ListItem", position: 4, name: product.name, item: `${SITE.domain}/products/${product.slug}` },
    ],
  };

  return (
    <div>
      {archivedPreview ? (
        <div className="bg-clay px-4 py-2 text-center text-[11px] font-bold tracking-wide text-white">
          ARCHIVED — hidden from the store. Only admins can see this page.{" "}
          <Link href="/admin/products" className="underline">
            Manage products
          </Link>
        </div>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(publishedJsonLd)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(breadcrumbJsonLd)}
      />

      <div className="wrap py-6">
        <nav className="text-[10.5px] font-semibold tracking-[0.1em] text-ink/40 uppercase">
          <Link href="/" className="hover:text-ink">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/shop" className="hover:text-ink">Catalog</Link>
          <span className="mx-2">/</span>
          <Link href={`/shop?category=${product.category}`} className="hover:text-ink">
            {categoryName(product.category)}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink/70">{product.name}</span>
        </nav>
      </div>

      <div className="wrap grid gap-10 pb-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <ProductGallery images={product.images} name={product.name} badge={product.badges[0]} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Package, label: `${product.caseSize} units / case` },
              { icon: Boxes, label: `${product.stock} cases ready` },
              { icon: MapPin, label: originLabel || "Origin on label" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-ink/10 bg-[#fffdf8] px-2 py-3">
                <item.icon size={15} className="mx-auto text-fern" />
                <p className="mt-1.5 text-[10px] font-semibold leading-tight text-ink/60">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold tracking-[0.18em] text-fern uppercase">
              {product.brand}
            </span>
            <span className="text-ink/20">|</span>
            <span className="text-[10.5px] font-medium tracking-wide text-ink/45 uppercase">
              SKU {product.sku}
            </span>
          </div>
          <h1 className="display mt-2 text-[34px] leading-[1.05] sm:text-[42px]">{product.name}</h1>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink/65">{product.tagline}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {hasReviews ? (
              <>
                <span className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star
                      key={star}
                      size={13}
                      className={star < Math.round(averageRating) ? "fill-gold text-gold" : "text-ink/20"}
                    />
                  ))}
                  <span className="ml-1 text-[11.5px] font-bold">{averageRating.toFixed(1)}</span>
                </span>
                <a href="#reviews" className="text-[11.5px] text-ink/50 underline underline-offset-4">
                  {productReviews.length} buyer review{productReviews.length === 1 ? "" : "s"}
                </a>
              </>
            ) : (
              <span className="chip border-clay/25 bg-clay/10 text-clay">New to the catalog</span>
            )}
            <span className="chip border-fern/25 bg-fern/8 text-fern">
              {product.leadTimeDays}-day dispatch
            </span>
          </div>

          <div className="mt-5">
            {showPrices ? (
              <BuyBox
                product={buyBoxProduct}
                accountDiscountPct={wholesaleApproved ? user?.wholesaleDiscountPct ?? 0 : 0}
                taxExempt={Boolean(user?.taxExempt)}
                wholesaleApproved={wholesaleApproved}
              />
            ) : (
              <div className="rounded-xl border border-ink/12 bg-[#fffdf8] p-5">
                <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-ink/50 uppercase">
                  <Lock size={13} /> Wholesale price
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/70">
                  Case pricing, volume tiers and ordering are available to approved trade accounts.
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-ink/10 py-3 text-[11.5px]">
                  <div>
                    <dt className="text-ink/45">Case pack</dt>
                    <dd className="font-semibold">{product.caseSize} units</dd>
                  </div>
                  <div>
                    <dt className="text-ink/45">Minimum</dt>
                    <dd className="font-semibold">{product.minCases} case{product.minCases === 1 ? "" : "s"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/45">MSRP</dt>
                    <dd className="font-semibold">{formatMoney(product.msrpUnit)} / unit</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {user ? null : (
                    <Link href={`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`} className="btn btn-outline btn-sm">
                      Sign in
                    </Link>
                  )}
                  <Link href="/wholesale/apply" className="btn btn-primary btn-sm">
                    {user ? "Apply for wholesale pricing" : "Apply for a trade account"}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="border-y border-ink/10 bg-[#fbf8f1]">
        <div className="wrap grid gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="display text-[26px]">Product detail</h2>
            <div className="mt-3 space-y-3">
              {descriptionParagraphs.map((paragraph, index) => (
                <p key={index} className="text-[13px] leading-relaxed text-ink/70">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-ink/10 bg-cream p-4">
              <p className="text-[10px] font-bold tracking-[0.16em] text-fern uppercase">
                Sourcing note
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/65">{product.story}</p>
            </div>

            <h3 className="mt-8 text-[11px] font-bold tracking-[0.16em] text-ink/45 uppercase">
              What ships in the case
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {product.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink/70">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fern" /> {feature}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="display text-[26px]">Specifications</h2>
            <dl className="mt-3 divide-y divide-ink/8 overflow-hidden rounded-lg border border-ink/10 bg-[#fffdf8]">
              {product.specs.map((spec) => (
                <div key={spec.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="text-[11.5px] font-semibold text-ink/50">{spec.label}</dt>
                  <dd className="text-right text-[11.5px] font-medium text-ink/80">{spec.value}</dd>
                </div>
              ))}
            </dl>

            {labelFacts.length ? (
              <dl className="mt-4 divide-y divide-ink/8 overflow-hidden rounded-lg border border-ink/10 bg-[#fffdf8]">
                {labelFacts.map((fact) => (
                  <div key={fact.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[11.5px] font-semibold text-ink/50">{fact.label}</dt>
                    <dd className="text-right font-mono text-[11.5px] font-medium text-ink/80">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {amazonLink ? (
              <a
                href={amazonLink}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-fern hover:underline"
              >
                Compare the retail listing on Amazon <ExternalLink size={11} />
              </a>
            ) : null}

            <div className="mt-5 rounded-lg border border-fern/25 bg-fern/5 p-4">
              <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-fern uppercase">
                <Ruler size={13} /> Dimensional freight data
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-3 text-[11.5px]">
                <div>
                  <p className="text-ink/45">Carton dimensions</p>
                  <p className="font-semibold">
                    {product.dimensions.l} × {product.dimensions.w} × {product.dimensions.h} in
                  </p>
                </div>
                <div>
                  <p className="text-ink/45">Actual weight</p>
                  <p className="font-semibold">{caseWeightLbs} lb</p>
                </div>
                <div>
                  <p className="text-ink/45">Dim weight (÷139)</p>
                  <p className="font-semibold">{dimWeight.toFixed(1)} lb</p>
                </div>
                <div>
                  <p className="text-ink/45">Billable per case</p>
                  <p className="font-semibold">{billable.toFixed(1)} lb</p>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-2 border-t border-fern/15 pt-2.5 text-[11px] leading-relaxed text-fern">
                <Truck size={13} className="mt-0.5 shrink-0" />
                {palletised
                  ? "Oversized or heavy — this SKU can price as curbside LTL freight when the shipment crosses 150 lb billable."
                  : "Parcel eligible. Mixed carts consolidate into one billable weight and one tracking number."}
              </p>
            </div>

            {showPrices ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-ink/10 bg-[#fffdf8] p-3.5">
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">Unit cost</p>
                <p className="mt-1 text-[15px] font-bold">
                  {formatMoney(unitPriceOf(product.casePrice, product.caseSize))}
                </p>
                <p className="text-[10.5px] text-ink/45">MSRP {formatMoney(product.msrpUnit)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-[#fffdf8] p-3.5">
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">Case</p>
                <p className="mt-1 text-[15px] font-bold">{formatMoney(product.casePrice)}</p>
                <p className="text-[10.5px] text-ink/45">{product.caseSize} units · FOB Paterson</p>
              </div>
            </div>
            ) : null}
          </div>
        </div>
      </section>

      {product.ingredients || product.allergens.length || product.factsPanelImage || product.fdaDisclaimer || product.prop65Warning || documentedCerts.length ? (
        <section id="label" className="wrap grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="display text-[26px]">Label &amp; compliance</h2>
            {product.prop65Warning ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border-2 border-ink bg-[#fffdf8] p-4" role="note">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 fill-gold text-ink" aria-hidden="true" />
                <p className="text-[12.5px] leading-relaxed">
                  <strong>WARNING (California Proposition 65):</strong>{" "}
                  {product.prop65Warning.replace(/^\s*warning:?\s*/i, "")}{" "}
                  <a className="underline" href="https://www.p65warnings.ca.gov/" target="_blank" rel="noopener noreferrer">
                    www.P65Warnings.ca.gov
                  </a>
                </p>
              </div>
            ) : null}
            {product.ingredients ? (
              <div className="mt-4">
                <h3 className="text-[11px] font-bold tracking-[0.16em] text-ink/45 uppercase">Ingredients</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/70">{product.ingredients}</p>
              </div>
            ) : null}
            {product.allergens.length ? (
              <p className="mt-3 text-[12.5px] font-semibold">
                Contains: <span className="capitalize">{product.allergens.join(", ")}</span>
              </p>
            ) : product.taxClass !== "general" && product.ingredients ? (
              <p className="mt-3 text-[12px] text-ink/55">No major food allergens declared.</p>
            ) : null}
            {product.fdaDisclaimer ? (
              <p className="mt-4 border-l-2 border-ink/20 pl-3 text-[11.5px] leading-relaxed text-ink/60">
                *{FDA_DISCLAIMER}
              </p>
            ) : null}
            {documentedCerts.length ? (
              <div className="mt-5">
                <h3 className="text-[11px] font-bold tracking-[0.16em] text-ink/45 uppercase">Certifications on file</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {documentedCerts.map((cert) => (
                    <li key={cert.name}>
                      <a
                        href={cert.documentUrl ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-fern/30 bg-fern/8 px-3 py-1 text-[11px] font-semibold text-fern hover:underline"
                      >
                        <FileCheck2 size={12} /> {cert.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {nextLot?.expiresOn ? (
              <p className="mt-5 flex items-center gap-2 text-[11.5px] text-ink/60">
                <CalendarCheck size={13} className="text-fern" /> Orders ship from the earliest lot with at least{" "}
                {EXPIRY_PULL_DAYS} days to its best-by date; the lot number is printed on your packing slip.
              </p>
            ) : null}
          </div>
          {product.factsPanelImage ? (
            <figure className="rounded-xl border border-ink/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.factsPanelImage} alt={`${product.taxClass === "supplement" ? "Supplement" : "Nutrition"} Facts panel for ${product.name}`} className="mx-auto max-h-[520px] w-auto" />
              <figcaption className="mt-2 text-center text-[10.5px] text-ink/45">
                {product.taxClass === "supplement" ? "Supplement Facts" : "Nutrition Facts"} as printed on the label
              </figcaption>
            </figure>
          ) : null}
        </section>
      ) : null}

      <section id="reviews" className="wrap py-12">
        {!hasReviews ? (
          // No reviews: show nothing invented — no score, no star distribution, no buyer count.
          <div className="rounded-xl border border-dashed border-ink/20 bg-[#fffdf8] p-8 text-center">
            <h2 className="display text-[24px]">Buyer reviews</h2>
            <p className="mt-2 text-[12.5px] text-ink/55">No reviews yet for this product.</p>
          </div>
        ) : (
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <div className="rounded-xl border border-ink/10 bg-[#fffdf8] p-5 lg:sticky lg:top-32 lg:self-start">
            <h2 className="display text-[24px]">Buyer reviews</h2>
            <div className="mt-3 flex items-end gap-3">
              <p className="display text-[44px] leading-none">{averageRating.toFixed(1)}</p>
              <div className="pb-1">
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star
                      key={star}
                      size={13}
                      className={star < Math.round(averageRating) ? "fill-gold text-gold" : "text-ink/20"}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-ink/50">
                  {productReviews.length} review{productReviews.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const share = Math.round(
                  (productReviews.filter((review) => review.rating === star).length / productReviews.length) * 100,
                );
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="w-3 text-[10.5px] font-bold text-ink/45">{star}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${share}%` }} />
                    </div>
                    <span className="w-8 text-right text-[10px] text-ink/40">{share}%</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-ink/10 pt-3 text-[10.5px] leading-relaxed text-ink/50">
              Reviews are collected from verified trade accounts after a delivered order. We do not
              remove negative reviews; we respond to them.
            </p>
          </div>

          <div className="space-y-3">
            {(
              productReviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-ink/10 bg-[#fffdf8] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex gap-0.5">
                        {[0, 1, 2, 3, 4].map((star) => (
                          <Star
                            key={star}
                            size={12}
                            className={star < review.rating ? "fill-gold text-gold" : "text-ink/20"}
                          />
                        ))}
                      </div>
                      <h3 className="mt-1.5 text-[13px] font-bold">{review.title}</h3>
                    </div>
                    <span className="chip border-fern/25 bg-fern/8 text-fern">Verified buyer</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink/70">{review.body}</p>
                  <p className="mt-2.5 text-[10.5px] font-medium text-ink/40">
                    {review.author} · {review.company} · {formatDate(review.createdAt)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
        )}
      </section>

      {related.length ? (
        <section className="border-t border-ink/10 bg-parchment/30 py-12">
          <div className="wrap">
            <div className="flex items-end justify-between">
              <h2 className="display text-[26px]">Complete the pallet</h2>
              <Link href={`/shop?category=${product.category}`} className="text-[11.5px] font-bold underline underline-offset-4">
                All {categoryName(product.category)}
              </Link>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item, index) => (
                <ProductCard key={item.id} product={toCardProduct(item, showPrices)} index={index} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
