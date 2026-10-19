import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { ArrowLeft, Boxes, Eye, EyeOff, Package } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminProducts, type AdminProduct } from "@/components/admin/AdminProducts";

export const metadata = {
  title: "Admin · products",
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage() {
  const session = await requireStaffPage("view", "/admin/products");

  const rows = await db
    .select()
    .from(products)
    .orderBy(desc(products.active), asc(products.category), asc(products.name));

  const catalog: AdminProduct[] = rows.map(({ createdAt: _created, ratingX10: _rating, ...row }) => {
    void _created;
    void _rating;
    return { ...row, priceTiers: row.priceTiers ?? [], updatedAt: row.updatedAt.toISOString() };
  });

  const live = catalog.filter((product) => product.active).length;
  const lowStock = catalog.filter((product) => product.active && product.stock <= product.reorderPoint).length;

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
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Products</h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              Add new SKUs, upload photos, set case pricing and freight data — live in the store the moment
              you save.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/catalog" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
              Bulk import / export
            </Link>
            <Link href="/shop" className="btn btn-light btn-sm">
              View storefront
            </Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total SKUs", value: catalog.length, icon: Package },
            { label: "Live in store", value: live, icon: Eye },
            { label: "Archived", value: catalog.length - live, icon: EyeOff },
          ].map((stat) => (
            <div key={stat.label} className="card flex items-center justify-between p-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-ink/40 uppercase">{stat.label}</p>
                <p className="display mt-1.5 text-[26px] leading-none">{stat.value}</p>
              </div>
              <stat.icon size={18} className="text-fern" />
            </div>
          ))}
        </div>
        {lowStock > 0 ? (
          <p className="mb-4 flex items-center gap-2 rounded-lg border border-clay/25 bg-clay/8 px-4 py-2.5 text-[11.5px] text-clay">
            <Boxes size={14} /> {lowStock} live SKU{lowStock === 1 ? " is" : "s are"} at 10 cases or fewer —
            update stock below.
          </p>
        ) : null}

        <AdminProducts products={catalog} />
      </div>
    </div>
  );
}
