import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { listQuotes } from "@/lib/quotes";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminQuotes } from "@/components/admin/AdminQuotes";

export const metadata = {
  title: "Admin · quotes",
  robots: { index: false, follow: false },
};

export default async function AdminQuotesPage() {
  const staff = await requireStaffPage("view", "/admin/quotes");
  const quotes = await listQuotes();

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Quote requests</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            Price every line and set how long the quote stands. When the buyer accepts, those prices become their
            agreed price list automatically and apply to every order until the quote expires.
          </p>
        </div>
        <AdminNav />
      </section>
      <div className="wrap py-8">
        <AdminQuotes quotes={quotes} canQuote={hasPermission(staff, "accounts")} />
      </div>
    </div>
  );
}
