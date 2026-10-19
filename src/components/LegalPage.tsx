import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

/*
 * Policy pages. The text reflects how the store actually works (see IS-PLANI.md §4) but is a
 * DRAFT: it must be reviewed by a US attorney before launch, and updated whenever the rules
 * in code change (tax, delivery area, payment terms, returns).
 */

export const POLICY_LINKS = [
  { href: "/legal/terms", label: "Terms of Sale" },
  { href: "/legal/shipping", label: "Shipping Policy" },
  { href: "/legal/returns", label: "Returns Policy" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/accessibility", label: "Accessibility" },
];

export const POLICIES_UPDATED = "October 19, 2026";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="wrap grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Policies" className="lg:sticky lg:top-28 lg:self-start">
        <p className="eyebrow">Policies</p>
        <ul className="mt-3 space-y-1">
          {POLICY_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="block rounded-md px-2.5 py-1.5 text-[12.5px] text-ink/70 hover:bg-ink/5 hover:text-ink">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-3xl">
        <h1 className="display text-[34px] leading-tight sm:text-[42px]">{title}</h1>
        <p className="mt-2 text-[11px] text-ink/45">Last updated {POLICIES_UPDATED}</p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink/70">{intro}</p>
        <div className="legal mt-6 space-y-6 text-[13px] leading-relaxed text-ink/75 [&_h2]:display [&_h2]:text-[21px] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          {children}
        </div>
        <p className="mt-10 border-t border-ink/10 pt-4 text-[12px] text-ink/55">
          Questions: <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> · {SITE.phone} · {SITE.address}
        </p>
      </article>
    </div>
  );
}
