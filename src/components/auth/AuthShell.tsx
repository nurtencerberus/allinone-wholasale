import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Package, Truck } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="wrap grid gap-12 py-12 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-16">
      <div className="order-2 lg:order-1">{children}</div>
      <div className="order-1 overflow-hidden rounded-2xl bg-ink p-8 text-cream lg:order-2 lg:p-10">
        <p className="text-[10px] font-bold tracking-[0.24em] text-gold uppercase">Meridian trade portal</p>
        <h2 className="display mt-3 text-[30px] leading-tight text-cream sm:text-[34px]">
          One login for pricing, freight and allocations.
        </h2>
        <div className="mt-7 space-y-4">
          {[
            { icon: BadgeCheck, title: "Account pricing", body: "Contract discount stacked on volume case pricing." },
            { icon: Truck, title: "Freight on your terms", body: "Parcel and LTL compared against your delivery ZIP." },
            { icon: Package, title: "Buyer tools", body: "Saved dock addresses, quick order and reorder history." },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3.5">
              <span className="mt-0.5 rounded-full border border-cream/20 p-2 text-sage">
                <item.icon size={15} />
              </span>
              <div>
                <p className="text-[12.5px] font-bold text-cream">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-cream/55">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-lg border border-cream/15 bg-cream/[0.04] p-4">
          <p className="text-[10.5px] font-semibold text-cream/70">
            Sessions use httpOnly cookies and scrypt-hashed passwords. Email confirmation is a
            required double opt-in before ordering.
          </p>
          <Link href="/wholesale" className="mt-2 inline-block text-[10.5px] font-bold text-gold underline">
            Read the trade program →
          </Link>
        </div>
      </div>
    </div>
  );
}
