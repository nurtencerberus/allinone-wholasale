import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { ArrowLeft, Boxes, Database, Package } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { CatalogTransfer } from "@/components/admin/CatalogTransfer";
import { categoryName } from "@/lib/site";
import { formatMoney, unitPriceOf } from "@/lib/money";

export const metadata = {
  title: "Admin · catalog transfer",
  robots: { index: false, follow: false },
};

export default async function AdminCatalogPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/admin/catalog");
  if (session.role !== "admin") redirect("/admin");

  const rows = await db.select().from(products).orderBy(asc(products.category), asc(products.name));
  const stock = rows.reduce((sum, product) => sum + product.stock, 0);

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream"
            >
              <ArrowLeft size={12} /> Admin console
            </Link>
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">
              Catalog transfer
            </h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              Export the full product catalog as JSON, or import product data from another project and
              merge it by SKU.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/users" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
              Users
            </Link>
            <Link href="/admin/orders" className="btn btn-light btn-sm">Orders</Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap grid gap-6 py-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <CatalogTransfer productCount={rows.length} />

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active SKUs", value: `${rows.length}`, icon: Package },
              { label: "Cases in stock", value: `${stock}`, icon: Boxes },
              { label: "Departments", value: "3", icon: Database },
            ].map((stat) => (
              <div key={stat.label} className="card p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[9.5px] font-bold tracking-[0.12em] text-ink/40 uppercase">{stat.label}</p>
                  <stat.icon size={14} className="text-fern" />
                </div>
                <p className="display mt-1.5 text-[22px] leading-none">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Live catalog</p>
            <span className="text-[10px] text-ink/45">Updates on import</span>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[#fffdf8] text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
                <tr className="border-b border-ink/8">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Dept</th>
                  <th className="px-2 py-2 text-right">Case</th>
                  <th className="px-2 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <tr key={product.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 font-mono text-[10px] text-fern">{product.sku}</td>
                    <td className="px-2 py-2">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-[9px] text-ink/40">
                        {product.caseSize} / case · {product.brand}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-ink/55">{categoryName(product.category)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(product.casePrice)}
                    </td>
                    <td className="px-2 py-2 text-right text-ink/55 tabular-nums">
                      {formatMoney(unitPriceOf(product.casePrice, product.caseSize))}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold tabular-nums ${
                        product.stock <= 10 ? "text-clay" : "text-ink/60"
                      }`}
                    >
                      {product.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
