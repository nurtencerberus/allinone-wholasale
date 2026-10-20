import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes";
import { PriceLockNotice } from "@/components/PriceLockNotice";
import { BuyerQuotes } from "@/components/account/BuyerQuotes";

export const metadata = {
  title: "Your quotes",
  robots: { index: false, follow: false },
};

export default async function BuyerQuotesPage() {
  const user = await getSessionUser();
  if (!canSeePrices(user)) return <PriceLockNotice user={user} next="/account/quotes" />;
  const quotes = await listQuotes(user.id);

  return (
    <div>
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-9">
          <Link href="/account" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-ink/65 hover:text-ink">
            <ArrowLeft size={12} /> Your account
          </Link>
          <h1 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">Quotes</h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink/72">
            Ask the trade desk for a price on the quantities you actually buy. Accepting a quote applies those
            prices to your orders until it expires — nothing to re-enter at checkout.
          </p>
        </div>
      </section>
      <div className="wrap py-8">
        <BuyerQuotes quotes={quotes} />
      </div>
    </div>
  );
}
