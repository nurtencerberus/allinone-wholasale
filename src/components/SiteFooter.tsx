import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { NewsletterForm } from "@/components/NewsletterForm";
import { POLICY_LINKS } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

const COLUMNS = [
  {
    title: "Shop the catalog",
    links: [
      { href: "/shop?category=supplements", label: "Vitamins & supplements" },
      { href: "/shop?category=pantry", label: "Pantry & staples" },
      { href: "/shop?category=home", label: "Home & living" },
      { href: "/shop?sort=newest", label: "New arrivals" },
      { href: "/quick-order", label: "Bulk quick order" },
    ],
  },
  {
    title: "Trade program",
    links: [
      { href: "/wholesale", label: "Wholesale overview" },
      { href: "/wholesale/apply", label: "Apply for a trade account" },
      { href: "/wholesale#terms", label: "Net 30 & payment terms" },
      { href: "/wholesale#freight", label: "Dimensional freight" },
      { href: "/wholesale#tax", label: "Resale tax exemption" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create an account" },
      { href: "/account", label: "Order history" },
      { href: "/account/addresses", label: "Saved addresses" },
    ],
  },
  { title: "Policies", links: POLICY_LINKS },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-cream">
      <div className="border-b border-cream/12">
        <div className="wrap grid gap-8 py-14 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-[11px] font-bold tracking-[0.24em] text-gold uppercase">The Thursday dispatch</p>
            <h3 className="display mt-3 max-w-lg text-3xl text-cream sm:text-[36px]">
              Allocations, freight windows and case-price changes. One email a week.
            </h3>
          </div>
          <div className="md:pl-10">
            <NewsletterForm />
            <p className="mt-3 text-[11.5px] leading-relaxed text-cream/50">
              For verified retail buyers. No consumer blasts, no resold lists. Unsubscribe in one click.
            </p>
          </div>
        </div>
      </div>

      <div className="wrap grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <div className="flex flex-col leading-none">
            <span className="display text-[26px] text-cream">Ciputra</span>
            <span className="text-[8.5px] font-semibold tracking-[0.36em] text-sage uppercase">
              Supply Co.
            </span>
          </div>
          <p className="mt-5 max-w-xs text-[12.5px] leading-relaxed text-cream/60">
            A wholesale supplier for independent American retail: wellness, shelf-stable
            provisions and small-batch home goods from one Paterson warehouse.
          </p>
          <div className="mt-6 space-y-2.5 text-[12.5px] text-cream/70">
            <p className="flex items-start gap-2.5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-sage" />
              {SITE.address}
            </p>
            <a href={`mailto:${SITE.email}`} className="flex items-center gap-2.5 hover:text-cream">
              <Mail size={14} className="text-sage" /> {SITE.email}
            </a>
            <a href={`tel:${SITE.phoneHref}`} className="flex items-center gap-2.5 hover:text-cream">
              <Phone size={14} className="text-sage" /> {SITE.phone}
            </a>
          </div>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-[10.5px] font-bold tracking-[0.2em] text-cream/50 uppercase">
              {column.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="group inline-flex items-center gap-1 text-[12.5px] text-cream/75 transition-colors hover:text-cream"
                  >
                    {link.label}
                    <ArrowUpRight
                      size={12}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-cream/12">
        <div className="wrap flex flex-col gap-4 py-6 text-[11px] text-cream/50 md:flex-row md:items-center md:justify-between">
          <p>© 2026 Ciputra Corp. · Prices in USD, FOB Paterson NJ.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Secure payments by Stripe · PCI-DSS SAQ-A</span>
            <span className="hidden h-3 w-px bg-cream/20 sm:block" />
            <span>Ships to the 48 contiguous states + DC</span>
            <span className="hidden h-3 w-px bg-cream/20 sm:block" />
            <span>14-day returns</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
