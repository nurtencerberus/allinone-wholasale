import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { wholesaleLists } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminLists } from "@/components/admin/AdminLists";

export const metadata = {
  title: "Admin · wholesale lists",
  robots: { index: false, follow: false },
};

export default async function AdminListsPage() {
  const session = await requireStaffPage("view", "/admin/lists");

  // The file body (bytea) is deliberately not selected here.
  const rows = await db
    .select({
      id: wholesaleLists.id,
      title: wholesaleLists.title,
      supplier: wholesaleLists.supplier,
      description: wholesaleLists.description,
      category: wholesaleLists.category,
      audience: wholesaleLists.audience,
      filename: wholesaleLists.filename,
      format: wholesaleLists.format,
      bytes: wholesaleLists.bytes,
      rowCount: wholesaleLists.rowCount,
      published: wholesaleLists.published,
      downloads: wholesaleLists.downloads,
      updatedAt: wholesaleLists.updatedAt,
    })
    .from(wholesaleLists)
    .orderBy(desc(wholesaleLists.updatedAt));

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
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Wholesale lists</h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              Upload supplier .xlsx / .csv files and publish them on the homepage.
            </p>
          </div>
          <Link href="/#wholesale-lists" className="btn btn-light btn-sm">
            View on homepage
          </Link>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <AdminLists
          lists={rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
