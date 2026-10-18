import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  FileCheck2,
  FileSpreadsheet,
  MapPin,
  Package,
  Percent,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ProductCard } from "@/components/ProductCard";
import { PriceListSection, type PriceListProduct } from "@/components/PriceListSection";
import { WholesaleListsSection, type WholesaleListCard } from "@/components/WholesaleListsSection";
import { wholesaleLists } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canAccessTrade } from "@/lib/wholesale-lists";
import { listStaticDownloads } from "@/lib/downloads";
import { ensureSeeded } from "@/lib/seed";
import { demoModeEnabled } from "@/lib/demo-mode";
import { CATEGORIES, SITE } from "@/lib/site";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Wholesale Vitamins, Pantry Staples & Home Goods",
  description:
    "Buy by the case from Ciputra Corp.: supplements, shelf-stable pantry staples and home goods. Verified EIN resale tax exemption, dimensional freight quotes and net 30 terms.",
  alternates: { canonical: "/" },
};

const PROOF = [
  { value: "1,400+", label: "Independent retail accounts" },
  { value: "98.6%", label: "Case fill rate, trailing 12mo" },
  { value: "2 days", label: "Average dispatch time" },
  { value: "48", label: "States served, LTL included" },
];

const WHOLESALE_STEPS = [
  {
    title: "Apply in four minutes",
    body: "Company, EIN, resale volume and categories. No membership fee, no minimum commitment.",
    icon: FileCheck2,
  },
  {
    title: "We verify your EIN",
    body: "A trade specialist confirms your entity and resale certificate — usually within one business day.",
    icon: BadgeCheck,
  },
  {
    title: "Unlock account pricing",
    body: "Contract case pricing, automatic resale tax exemption, quick-order uploads and net 30 terms.",
    icon: Percent,
  },
];

const VALUE_PROPS = [
  {
    icon: Truck,
    title: "Dimensional freight, priced honestly",
    body: "Billable weight is calculated from the greater of actual and dimensional weight, then quoted parcel or LTL against your ZIP at checkout.",
  },
  {
    icon: ShieldCheck,
    title: "Resale tax exemption built in",
    body: "Verified EIN accounts have sales tax suppressed automatically, with exemption certificates stored against the account.",
  },
  {
    icon: Boxes,
    title: "Mixed pallets, one inbound lane",
    body: "Consolidate supplements, pantry and home goods into a single shipment. Case-packed cartons, one tracking number.",
  },
  {
    icon: Package,
    title: "Case-packed and measured",
    body: "Every SKU is case-packed with a published carton weight and dimensions, so you know exactly what lands on your dock.",
  },
];

const FAQ = [
  {
    q: "Do I need a business entity to buy wholesale?",
    a: "You can browse and order at catalog case pricing as a guest, but account pricing, resale tax exemption and net 30 terms require an approved trade application with a verifiable EIN or state resale certificate. Sole proprietors with a valid seller's permit are welcome.",
  },
  {
    q: "How is freight calculated on heavy or bulky orders?",
    a: "Every SKU stores carton dimensions and weight. At checkout we calculate dimensional weight (L × W × H ÷ 139), compare it against actual weight, and quote UPS Ground, UPS 2nd Day Air and — once the shipment crosses 150 lb or includes oversized cartons — curbside LTL freight. You see the billable weight and the rate basis before you pay.",
  },
  {
    q: "What are the payment terms?",
    a: "Pay by card, by ACH or wire transfer, or — for approved trade accounts — on Net-30 terms against a purchase order. Card payments are processed by Stripe; card numbers never reach our servers.",
  },
  {
    q: "Is sales tax charged on wholesale orders?",
    a: "Tax is calculated dynamically from the destination ZIP using destination-based nexus rules. Approved resale accounts with a verified EIN and certificate are marked tax-exempt for their registered state and pay no sales tax at checkout.",
  },
  {
    q: "Do you offer drop-shipping or product assets?",
    a: "Ask the trade desk. Availability of product photography, spec sheets and drop-shipping depends on the product and your account — email us and we will confirm before you order.",
  },
];

export default async function HomePage() {
  // Layout and page render in parallel — make sure a fresh database is seeded
  // before the catalog and wholesale lists are queried below.
  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[home] seed unavailable", error);
  }

  let featured: (typeof products.$inferSelect)[] = [];
  let priceList: PriceListProduct[] = [];
  try {
    featured = await db
      .select()
      .from(products)
      .where(and(eq(products.featured, true), eq(products.active, true)))
      // Newest featured products first, so a freshly added SKU actually appears.
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(4);
    if (featured.length === 0) {
      featured = await db.select().from(products).where(eq(products.active, true)).limit(4);
    }
    const catalog = await db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name));
    priceList = catalog.map((product) => ({
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
      caseSize: product.caseSize,
      casePrice: product.casePrice,
      priceTiers: product.priceTiers ?? [],
      msrpUnit: product.msrpUnit,
      stock: product.stock,
      weightLbs: product.weightLbs,
      slug: product.slug,
    }));
  } catch (error) {
    console.error("[home] catalog unavailable", error);
  }
  const downloadFiles = await listStaticDownloads();

  // Supplier lists. The file body (bytea) is never selected for the page, and
  // trade-only lists reach anonymous visitors without columns or preview rows.
  let supplierLists: WholesaleListCard[] = [];
  let signedIn = false;
  try {
    const viewer = await getSessionUser();
    signedIn = Boolean(viewer);
    const tradeAccess = canAccessTrade(viewer);
    const listRows = await db
      .select({
        id: wholesaleLists.id,
        title: wholesaleLists.title,
        supplier: wholesaleLists.supplier,
        description: wholesaleLists.description,
        category: wholesaleLists.category,
        audience: wholesaleLists.audience,
        format: wholesaleLists.format,
        bytes: wholesaleLists.bytes,
        rowCount: wholesaleLists.rowCount,
        columns: wholesaleLists.columns,
        preview: wholesaleLists.preview,
        updatedAt: wholesaleLists.updatedAt,
      })
      .from(wholesaleLists)
      .where(eq(wholesaleLists.published, true))
      .orderBy(desc(wholesaleLists.updatedAt));

    supplierLists = listRows.map((row) => {
      const locked = row.audience === "trade" && !tradeAccess;
      return {
        id: row.id,
        title: row.title,
        supplier: row.supplier,
        description: row.description,
        category: row.category,
        audience: row.audience === "trade" ? "trade" : "public",
        format: row.format,
        bytes: row.bytes,
        rowCount: row.rowCount,
        columns: locked ? [] : row.columns,
        preview: locked ? [] : row.preview,
        updatedAt: row.updatedAt.toISOString(),
        locked,
      };
    });
  } catch (error) {
    console.error("[home] wholesale lists unavailable", error);
  }

  const sample = featured[0];
  // Invented social proof (customer counts, ratings, certifications, testimonials) is shown on
  // demo deployments only. A live store must never publish claims it cannot back up.
  const demo = demoModeEnabled();
  const sampleMsrpCase = sample ? sample.msrpUnit * sample.caseSize : 0;

  return (
    <>
      {/* Hero ------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-ink/10 bg-cream">
        <div className="pointer-events-none absolute -right-40 top-0 h-[520px] w-[520px] rounded-full bg-sage/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-[320px] w-[320px] rounded-full bg-gold/10 blur-3xl" />
        <div className="wrap relative grid gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <div className="animate-rise">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip border-clay/30 bg-clay/10 text-clay">
                <span className="h-1.5 w-1.5 rounded-full bg-clay" /> B2B only · USA
              </span>
              <span className="text-[11px] font-medium tracking-wide text-ink/50">
                Shipping from {SITE.city}, {SITE.state} · {SITE.zip}
              </span>
            </div>
            <h1 className="display mt-5 text-[42px] leading-[0.98] sm:text-[58px] lg:text-[64px]">
              Stock the shelf.
              <br />
              Skip the <em className="font-light italic text-clay">middleman</em>.
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink/70">
              Case-priced vitamins and supplements, shelf-stable pantry staples, and small-batch home
              goods — engineered for independent retail. Apply once, then buy at contract pricing with
              resale tax exemption, dimensional freight and net 30 terms.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/shop" className="btn btn-primary px-7">
                Shop the catalog <ArrowRight size={16} />
              </Link>
              <Link href="/wholesale/apply" className="btn btn-outline px-6">
                Apply for wholesale
              </Link>
              <a
                href={supplierLists.length ? "#wholesale-lists" : "#price-lists"}
                className="btn btn-outline px-6"
              >
                <FileSpreadsheet size={15} /> Wholesale lists (XLSX / CSV)
              </a>
            </div>
            {demo ? (
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/10 pt-6 sm:grid-cols-4">
              {PROOF.map((item) => (
                <div key={item.label}>
                  <p className="font-display text-[26px] leading-none">{item.value}</p>
                  <p className="mt-1.5 text-[10.5px] font-medium leading-tight tracking-wide text-ink/50 uppercase">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            ) : null}
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-[20px] border border-ink/10 shadow-[0_30px_70px_-40px_rgba(20,36,28,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/hero-warehouse.jpg"
                alt="Wholesale warehouse shelves stocked with cartons, supplement bottles and home goods"
                className="h-[380px] w-full object-cover sm:h-[460px] lg:h-[540px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
              <div className="absolute left-4 top-4 rounded-lg bg-cream/95 px-3 py-2 backdrop-blur">
                <p className="text-[9px] font-bold tracking-[0.18em] text-fern uppercase">Ships from</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold">
                  <MapPin size={11} /> {SITE.city}, {SITE.state}
                </p>
              </div>
              {sample ? (
              <div className="absolute inset-x-4 bottom-4 rounded-xl border border-cream/20 bg-ink/75 p-4 backdrop-blur-md">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9.5px] font-bold tracking-[0.18em] text-sage uppercase">
                      Case of {sample.caseSize} · trade price
                    </p>
                    <p className="display mt-1 text-[26px] text-cream">
                      {formatMoney(sample.casePrice)}
                      <span className="ml-1.5 text-[11px] font-sans text-cream/60">/ case</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9.5px] font-bold tracking-[0.18em] text-sage uppercase">MSRP case</p>
                    <p className="mt-1 text-[15px] font-semibold text-cream/85 tabular-nums">
                      {formatMoney(sampleMsrpCase)}
                    </p>
                    <p className="text-[9.5px] text-cream/50">
                      {sampleMsrpCase ? Math.round(((sampleMsrpCase - sample.casePrice) / sampleMsrpCase) * 100) : 0}% margin
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-cream/15 pt-2.5 text-[10px] text-cream/65">
                  <Truck size={12} /> Dimensional freight quoted at checkout
                  {demo ? (
                    <span className="ml-auto flex items-center gap-1">
                      <Star size={10} className="fill-gold text-gold" /> 4.8 trade rating
                    </span>
                  ) : null}
                </div>
              </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Certification strip (demo only) ----------------------------- */}
      {demo ? (
      <div className="border-b border-ink/10 bg-parchment/60">
        <div className="wrap flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-4 text-[10px] font-bold tracking-[0.18em] text-ink/45 uppercase">
          <span>NSF Certified</span>
          <span className="text-ink/20">◆</span>
          <span>cGMP facilities</span>
          <span className="text-ink/20">◆</span>
          <span>IFOS 5-star</span>
          <span className="text-ink/20">◆</span>
          <span>IGP Gragnano</span>
          <span className="text-ink/20">◆</span>
          <span>True Source Honey</span>
          <span className="text-ink/20">◆</span>
          <span>Stripe PCI-DSS</span>
        </div>
      </div>
      ) : null}

      {/* Categories ------------------------------------------------ */}
      <section className="wrap py-16 lg:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Three departments, one purchase order</p>
            <h2 className="display mt-2 max-w-xl text-[32px] leading-tight sm:text-[42px]">
              Built for the way small retail actually buys.
            </h2>
          </div>
          <Link href="/shop" className="group inline-flex items-center gap-2 text-[12.5px] font-bold text-ink">
            Browse all products
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {CATEGORIES.map((category) => (
            <Link
              key={category.key}
              href={`/shop?category=${category.key}`}
              className="group relative overflow-hidden rounded-xl border border-ink/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={category.image}
                alt={category.name}
                className="h-[300px] w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-[360px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-[9.5px] font-bold tracking-[0.22em] text-sage uppercase">
                  {category.eyebrow}
                </p>
                <h3 className="display mt-1.5 text-[25px] text-cream">{category.name}</h3>
                <p className="mt-1.5 max-w-[300px] text-[11.5px] leading-relaxed text-cream/70">
                  {category.blurb}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-cream uppercase">
                  Explore cases <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products ----------------------------------------- */}
      {featured.length > 0 ? (
      <section className="border-y border-ink/10 bg-[#fbf8f1] py-16">
        <div className="wrap">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Best sellers · ready to ship</p>
              <h2 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">
                The cases our accounts reorder.
              </h2>
            </div>
            <Link href="/shop?sort=rating" className="btn btn-outline btn-sm">
              Shop all cases <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {/* Wholesale lists — supplier .xlsx / .csv files ---------------- */}
      <WholesaleListsSection lists={supplierLists} signedIn={signedIn} />

      {/* Product lists (XLSX / CSV) generated from the live catalog ---- */}
      <PriceListSection products={priceList} files={downloadFiles} />

      {/* Value props ----------------------------------------------- */}
      <section className="wrap py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">The wholesale difference</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">
              The unglamorous details that make you money.
            </h2>
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-ink/65">
              Most distributors hide freight, tax and case dimensions until the invoice. We publish
              them in the catalog and price them before you pay.
            </p>
            <div className="mt-6 rounded-xl border border-ink/10 bg-parchment/50 p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-fern p-2 text-cream">
                  <Building2 size={16} />
                </span>
                <div>
                  <p className="text-[12.5px] font-bold">Buying for a shop, gym or hotel?</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink/60">
                    Trade applications are reviewed by a human on our trade team — most are approved within one
                    business day.
                  </p>
                  <Link
                    href="/wholesale/apply"
                    className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-bold underline underline-offset-4"
                  >
                    Start an application <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {VALUE_PROPS.map((prop) => (
              <div key={prop.title} className="rounded-xl border border-ink/10 bg-[#fffdf8] p-5">
                <span className="inline-flex rounded-full bg-fern/10 p-2.5 text-fern">
                  <prop.icon size={17} />
                </span>
                <h3 className="mt-3.5 text-[13.5px] font-bold leading-snug">{prop.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/60">{prop.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wholesale program ---------------------------------------- */}
      <section className="bg-ink py-16 text-cream lg:py-20" id="trade">
        <div className="wrap grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-[11px] font-bold tracking-[0.24em] text-gold uppercase">
              Ciputra trade account
            </p>
            <h2 className="display mt-3 text-[34px] leading-tight text-cream sm:text-[44px]">
              Your pricing should look like your business, not a retail tag.
            </h2>
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-cream/65">
              Approved accounts receive a contract discount stacked on volume case pricing, automatic
              resale tax exemption, and a quick-order panel that turns a SKU list into a purchase order
              in seconds.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/wholesale/apply" className="btn btn-clay px-6">
                Apply for a trade account
              </Link>
              <Link href="/wholesale" className="btn border border-cream/25 px-5 text-cream hover:bg-cream/10">
                Program details
              </Link>
            </div>
            <p className="mt-4 text-[11px] text-cream/40">
              No membership fee · No volume commitment · EIN or state seller&apos;s permit required
            </p>
          </div>
          <div className="grid gap-4">
            {WHOLESALE_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="flex items-start gap-4 rounded-xl border border-cream/12 bg-cream/[0.04] p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/20 font-display text-[15px] text-gold">
                  {index + 1}
                </span>
                <div>
                  <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-cream">
                    <step.icon size={14} className="text-sage" /> {step.title}
                  </h3>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/60">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Margin table --------------------------------------------- */}
      {sample ? (
      <section className="wrap py-16 lg:py-20" id="pricing">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow">Pricing model</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">
              Volume tiers apply automatically. Account discounts stack on top.
            </h2>
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink/65">
              Every SKU carries three case tiers in the database. Your order quantity resolves the tier
              server-side at checkout — no code hunting, no rep call. Approved trade accounts then take
              their contract percentage off the tier price.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Tier pricing resolved per line, per order",
                "Contract discount applied before sales tax",
                "Coupons remain valid on top of account pricing",
                "Tax exemption applied automatically where verified",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] text-ink/70">
                  <Check size={15} className="mt-0.5 shrink-0 text-fern" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-xl border border-ink/10 bg-[#fffdf8]">
            <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-5 py-3.5">
              <div>
                <p className="text-[12.5px] font-bold">{sample?.name ?? "Daily Foundations Multivitamin"}</p>
                <p className="text-[10px] font-medium tracking-wider text-ink/45 uppercase">
                  {sample?.sku ?? "MSC-VIT-090"} · {sample?.caseSize ?? 12} units / case
                </p>
              </div>
              <span className="chip">Volume ladder</span>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-ink/8 text-[9.5px] font-bold tracking-[0.14em] text-ink/45 uppercase">
                  <th className="px-5 py-2.5">Quantity</th>
                  <th className="px-3 py-2.5">Case price</th>
                  <th className="px-3 py-2.5">Per unit</th>
                  <th className="px-5 py-2.5 text-right">Retail margin</th>
                </tr>
              </thead>
              <tbody>
                {(sample.priceTiers?.length
                  ? [{ minCases: 1, casePrice: sample.casePrice }, ...sample.priceTiers]
                  : [{ minCases: 1, casePrice: sample.casePrice }]
                ).map((tier) => {
                  const size = sample.caseSize;
                  const msrpCase = sample.msrpUnit * size;
                  const margin = msrpCase ? Math.round(((msrpCase - tier.casePrice) / msrpCase) * 100) : 0;
                  return (
                    <tr key={tier.minCases} className="border-b border-ink/5 last:border-0">
                      <td className="px-5 py-3 font-semibold">
                        {tier.minCases === 1 ? "1 case" : `${tier.minCases}+ cases`}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{formatMoney(tier.casePrice)}</td>
                      <td className="px-3 py-3 text-ink/55 tabular-nums">
                        {formatMoney(Math.round(tier.casePrice / size))}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="rounded-full bg-fern/10 px-2 py-1 text-[10.5px] font-bold text-fern">
                          {margin}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-ink/10 bg-fern/5 px-5 py-3 text-[10.5px] leading-relaxed text-fern">
              Approved trade accounts add their contract discount on top of the tier price. Freight and
              destination tax are quoted separately before payment.
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {/* Testimonials (demo only) ---------------------------------- */}
      {demo ? (
      <section className="border-y border-ink/10 bg-parchment/40 py-16">
        <div className="wrap">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">From the buying side</p>
              <h2 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">
                Buyers keep the account for the boring reasons.
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-[#fffdf8] px-4 py-2">
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star key={star} size={12} className="fill-gold text-gold" />
                ))}
              </div>
              <span className="text-[11.5px] font-bold">4.8 / 5</span>
              <span className="text-[11px] text-ink/45">· 1,412 verified reviews</span>
            </div>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                quote:
                  "Consolidated freight is the whole reason we moved our pantry program here. One PO across three departments, one tracking number, and the dimensional weight landed exactly as quoted.",
                name: "Ben Okafor",
                company: "Okafor Grocery · Houston, TX",
                stat: "$180 saved per mixed pallet",
              },
              {
                quote:
                  "The CoA is in the box every single time. That saves my staff a week of chasing paperwork and it is why the supplements never get switched to another distributor.",
                name: "Dana Whitfield",
                company: "Harbor House Pharmacy · Portland, ME",
                stat: "Tax-exempt resale on file",
              },
              {
                quote:
                  "Our four-chair LTL quote came in $60 under my own broker, and the tracking link updated on its own. I did not have to call anyone, which is the real luxury.",
                name: "Devon Pike",
                company: "Pike Modern · Chicago, IL",
                stat: "LTL in 4 days",
              },
            ].map((testimonial) => (
              <figure
                key={testimonial.name}
                className="flex flex-col rounded-xl border border-ink/10 bg-[#fffdf8] p-5"
              >
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star key={star} size={12} className="fill-gold text-gold" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-[12.5px] leading-relaxed text-ink/75">
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-4 border-t border-ink/8 pt-3">
                  <p className="text-[12px] font-bold">{testimonial.name}</p>
                  <p className="text-[10.5px] text-ink/50">{testimonial.company}</p>
                  <p className="mt-1.5 inline-flex rounded-full bg-fern/10 px-2 py-0.5 text-[10px] font-bold text-fern">
                    {testimonial.stat}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {/* FAQ ------------------------------------------------------ */}
      <section className="wrap py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="eyebrow">Trade questions</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[38px]">
              Everything a new buyer asks us.
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-ink/60">
              Still unsure? The trade desk answers within one business hour,{" "}
              {new Date().getHours() < 17 ? "Monday to Friday" : "next business morning"}.
            </p>
            <a href={`mailto:${SITE.email}`} className="btn btn-outline btn-sm mt-5">
              Email the trade desk
            </a>
          </div>
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <span className="text-[13.5px] font-bold leading-snug">{item.q}</span>
                  <ChevronDown
                    size={17}
                    className="mt-0.5 shrink-0 text-ink/40 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-2.5 max-w-[640px] text-[12.5px] leading-relaxed text-ink/65">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA ---------------------------------------------- */}
      <section className="wrap pb-4">
        <div className="relative overflow-hidden rounded-2xl bg-moss px-6 py-14 text-cream sm:px-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-cream/10" />
          <div className="pointer-events-none absolute -right-4 -top-4 h-40 w-40 rounded-full border border-cream/10" />
          <div className="relative max-w-2xl">
            <p className="text-[11px] font-bold tracking-[0.24em] text-gold uppercase">
              Opening a new account
            </p>
            <h2 className="display mt-3 text-[34px] leading-tight text-cream sm:text-[44px]">
              Send us your EIN. We will send back your pricing.
            </h2>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-cream/65">
              Applications are reviewed by the trade team, not an auto-approval script. Most
              decisions land within one business day.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/wholesale/apply" className="btn btn-light px-6">
                Start application
              </Link>
              <Link href="/shop" className="btn border border-cream/25 px-5 text-cream hover:bg-cream/10">
                Browse without an account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
