import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { QuickOrderPanel } from "@/components/QuickOrderPanel";
import { PriceLockNotice } from "@/components/PriceLockNotice";
import { cachedActiveCatalog } from "@/lib/catalog-cache";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { ozToLbs } from "@/lib/weight";

export const metadata = {
  title: "Quick order · bulk case ordering",
  description:
    "Order every wholesale SKU from one table: set case quantities, see live stock, volume pricing and freight weight, or upload an XLS/CSV order sheet.",
  alternates: { canonical: "/quick-order" },
};

export default async function QuickOrderPage() {
  const user = await getSessionUser();
  if (!canSeePrices(user)) return <PriceLockNotice user={user} next="/quick-order" />;
  const catalog = await cachedActiveCatalog();

  const wholesale = user?.accountTier === "wholesale";
  const discountPct = wholesale ? (user?.wholesaleDiscountPct ?? 0) : 0;

  return (
    <div>
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap flex flex-col gap-4 py-9 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Stock replenishment</p>
            <h1 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">Quick order</h1>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink/72">
              Every SKU in one table. Set case quantities, watch freight weight and subtotal update, then add
              the whole order to the cart — or fill the table from an XLS/CSV order sheet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/order-sheet/download?format=xlsx" download className="btn btn-primary btn-sm">
              <Download size={13} /> XLS order sheet
            </a>
            <a href="/api/order-sheet/download?format=csv" download className="btn btn-outline btn-sm">
              <Download size={13} /> CSV
            </a>
            <Link href="/account" className="btn btn-outline btn-sm">
              Order history <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap py-8">
        {wholesale ? (
          <div className="mb-4 rounded-lg bg-moss px-4 py-2.5 text-[11px] font-semibold text-cream">
            Trade pricing active — {discountPct}% contract discount is applied to every line
            {user?.taxExempt ? " · resale tax exemption on file" : ""}.
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/12 bg-[#fffdf8] px-4 py-2.5 text-[11px] text-ink/72">
            <span>Catalog case pricing shown. Contract pricing requires an approved trade account.</span>
            <Link href="/wholesale/apply" className="font-bold text-ink underline">
              Apply for wholesale
            </Link>
          </div>
        )}

        <QuickOrderPanel
          wholesale={wholesale}
          discountPct={discountPct}
          skus={catalog.map((product) => ({
            productId: product.id,
            sku: product.sku,
            slug: product.slug,
            name: product.name,
            brand: product.brand,
            category: product.category,
            caseSize: product.caseSize,
            casePrice: product.casePrice,
            priceTiers: product.priceTiers ?? [],
            stock: product.stock,
            image: product.image,
            minCases: product.minCases,
            msrpUnit: product.msrpUnit,
            weightLbs: ozToLbs(product.weightOz),
          }))}
        />
      </div>
    </div>
  );
}
