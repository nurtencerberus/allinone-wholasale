import Link from "next/link";
import { ArrowLeft, BadgeCheck, Clock, FileCheck2, ShieldCheck } from "lucide-react";
import { WholesaleApplyForm } from "@/components/WholesaleApplyForm";

export const metadata = {
  title: "Apply for a wholesale trade account",
  description:
    "Apply for Meridian Supply Co. wholesale pricing: EIN verification, account-specific contract pricing and resale tax exemption for US retailers.",
  alternates: { canonical: "/wholesale/apply" },
};

export default function ApplyPage() {
  return (
    <div>
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-10">
          <Link href="/wholesale" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/50 hover:text-ink">
            <ArrowLeft size={13} /> Wholesale program
          </Link>
          <h1 className="display mt-3 max-w-2xl text-[34px] leading-tight sm:text-[44px]">
            Trade application
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Four short sections. A Newark trade specialist verifies your EIN and resale documentation —
            most applications are decided within one business day. You can keep ordering at catalog case
            pricing in the meantime.
          </p>
        </div>
      </section>

      <div className="wrap grid gap-8 py-10 lg:grid-cols-[1.4fr_0.6fr]">
        <WholesaleApplyForm />

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">What you unlock</p>
            <ul className="mt-3 space-y-2.5">
              {[
                "Account-specific contract discount, stacked on volume case pricing",
                "Resale tax exemption where your certificate is verified",
                "Quick order by SKU for pallet replenishment",
                "Saved dock addresses and full order history",
                "Net 30 eligibility after two prepaid orders",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink/65">
                  <BadgeCheck size={13} className="mt-0.5 shrink-0 text-fern" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Review timeline</p>
            <div className="mt-3 space-y-3">
              {[
                { icon: FileCheck2, title: "Received", body: "Instant reference number by email." },
                { icon: ShieldCheck, title: "EIN verification", body: "Usually within one business day." },
                { icon: Clock, title: "Pricing activated", body: "Approval email + account update." },
              ].map((step) => (
                <div key={step.title} className="flex items-start gap-2.5">
                  <step.icon size={14} className="mt-0.5 shrink-0 text-fern" />
                  <div>
                    <p className="text-[11.5px] font-bold">{step.title}</p>
                    <p className="text-[10.5px] leading-relaxed text-ink/50">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-ink p-5 text-cream">
            <p className="text-[10.5px] font-bold tracking-[0.16em] text-gold uppercase">Need help?</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/65">
              The Newark trade desk answers EIN and freight questions directly, Monday–Friday 8am–6pm ET.
            </p>
            <a href="mailto:trade@meridiansupply.co" className="mt-3 inline-block text-[11px] font-bold text-cream underline">
              trade@meridiansupply.co
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
