import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { AddressManager } from "@/components/account/AddressManager";

export const metadata = {
  title: "Saved addresses",
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/addresses");

  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, user.id))
    .orderBy(desc(addresses.isDefault));

  return (
    <div className="wrap py-8 lg:py-10">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/68 hover:text-ink">
        <ArrowLeft size={13} /> Account
      </Link>
      <h1 className="display mt-2 text-[32px] leading-tight">Saved delivery addresses</h1>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/72">
        Dock addresses pre-fill checkout so freight and destination tax are priced on the first pass.
        LTL carriers use the freight phone to schedule delivery appointments.
      </p>
      <div className="mt-6">
        <AddressManager
          initial={rows.map((entry) => ({
            id: entry.id,
            label: entry.label,
            name: entry.name,
            company: entry.company,
            line1: entry.line1,
            line2: entry.line2,
            city: entry.city,
            state: entry.state,
            zip: entry.zip,
            phone: entry.phone,
            isDefault: entry.isDefault,
          }))}
        />
      </div>
    </div>
  );
}
