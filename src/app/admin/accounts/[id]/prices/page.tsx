import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { accountPrices, products, users } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { AdminNav } from "@/components/admin/AdminNav";
import { AccountPriceList, type AccountPriceRow, type PricebookProduct } from "@/components/admin/AccountPriceList";

export const metadata = {
  title: "Admin · account pricing",
  robots: { index: false, follow: false },
};

export default async function AccountPricesPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("view", "/admin/users");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      company: users.company,
      accountTier: users.accountTier,
      discountPct: users.wholesaleDiscountPct,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!account) notFound();

  const [catalog, agreed] = await Promise.all([
    db
      .select({ id: products.id, sku: products.sku, name: products.name, casePrice: products.casePrice, minCases: products.minCases })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.sku)),
    db.select().from(accountPrices).where(eq(accountPrices.userId, id)),
  ]);

  const rows: AccountPriceRow[] = agreed
    .map((row) => {
      const product = catalog.find((entry) => entry.id === row.productId);
      return {
        productId: row.productId,
        sku: product?.sku ?? `#${row.productId}`,
        name: product?.name ?? "Archived product",
        listCasePrice: product?.casePrice ?? 0,
        casePrice: row.casePrice,
        minCases: row.minCases,
        startsAt: row.startsAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        note: row.note,
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const pricebook: PricebookProduct[] = catalog.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    casePrice: product.casePrice,
    minCases: product.minCases,
  }));

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Accounts
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">
            {account.company || account.name}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            {account.email} · {account.accountTier === "wholesale" ? "trade account" : "retail account"}
            {account.discountPct ? ` · ${account.discountPct}% contract discount` : ""}
          </p>
          <p className="mt-2 max-w-2xl text-[11.5px] text-cream/55">
            An agreed price replaces the catalogue and volume price for this account on that SKU. The percentage
            discount above is <strong>not</strong> applied on top of it — the buyer is discounted once.
          </p>
        </div>
        <AdminNav />
      </section>
      <div className="wrap py-8">
        <AccountPriceList
          accountId={account.id}
          rows={rows}
          products={pricebook}
          canEdit={hasPermission(staff, "accounts")}
        />
      </div>
    </div>
  );
}
