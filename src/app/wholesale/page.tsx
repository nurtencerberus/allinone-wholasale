import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Calculator,
  Check,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  PackageCheck,
  Percent,
  Ruler,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { SITE } from "@/lib/site";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Wholesale program · account pricing, resale tax exemption & LTL freight",
  description:
    "Meridian Supply Co.'s B2B wholesale program: EIN verification, account-specific contract pricing, resale tax exemption, dimensional freight quotes and net 30 terms for US retailers.",
  alternates: { canonical: "/wholesale" },
};

const FREIGHT_EXAMPLES = [
  {
    label: "1 case · supplement",
    weight: "14 lb actual / 12.4 lb dim",
    billable: "15.5 lb",
    mode: "UPS Ground",
    zone: "Zone 2 (New England)",
    price: 2121,
  },
  {
    label: "6 cases · mixed pantry",
    weight: "120 lb actual / 96 lb dim",
    billable: "121.5 lb",
    mode: "UPS Ground",
    zone: "Zone 4 (Ohio)",
    price: 7755,
  },
  {
    label: "10 cases + lounge chair",
    weight: "168 lb actual / 210 lb dim",
    billable: "211.5 lb",
    mode: "Curbside LTL",
    zone: "Zone 6 (Texas)",
    price: 22930,
  },
];

const DOCS = [
  "Federal EIN (or state seller's permit for sole proprietors)",
  "State resale / exemption certificate for your ship-to state",
  "Business address matching the certificate",
  "Buyer contact with authority to purchase",
];

export default function WholesalePage() {
  return (
    <div>
      <section className="border-b border-ink/10 bg-ink text-cream">
        <div className="wrap grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
          <div>
            <p className="text-[11px] font-bold tracking-[0.24em] text-gold uppercase">The trade program</p>
            <h1 className="display mt-3 text-[38px] leading-[1.02] text-cream sm:text-[52px]">
              Wholesale pricing that survives contact with your P&amp;L.
            </h1>
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-cream/70">
              Apply once. Verify your EIN. Then buy supplements, pantry staples and home goods at contract
              case pricing — with resale tax exemption, honest dimensional freight and net 30 terms once
              you have two prepaid orders behind you.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/wholesale/apply" className="btn btn-clay px-6">
                Apply for a trade account <ArrowRight size={15} />
              </Link>
              <Link href="/shop" className="btn border border-cream/25 px-5 text-cream hover:bg-cream/10">
                Browse case pricing
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-5 border-t border-cream/15 pt-6 sm:grid-cols-4">
              {[
                { value: "1 day", label: "Typical EIN decision" },
                { value: "0%", label: "Membership fee" },
                { value: "30 days", label: "Net terms available" },
                { value: "48", label: "States served" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="display text-[24px] text-cream">{item.value}</p>
                  <p className="mt-1 text-[10px] font-semibold tracking-wide text-cream/50 uppercase">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-cream/15 bg-cream/[0.04] p-6">
            <p className="text-[10.5px] font-bold tracking-[0.2em] text-gold uppercase">Account snapshot</p>
            <p className="mt-2 text-[12px] text-cream/60">
              What an approved 8% contract account sees on a {formatMoney(29700)} order:
            </p>
            <dl className="mt-4 space-y-2 text-[12px]">
              {[
                ["Catalog case subtotal", formatMoney(29700)],
                ["Volume tier saving", `−${formatMoney(1485)}`],
                ["8% contract discount", `−${formatMoney(2257)}`],
                ["Resale tax exemption", "−$0.00 taxable"],
                ["Freight (dim weight)", formatMoney(4820)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-cream/10 pb-2">
                  <dt className="text-cream/60">{label}</dt>
                  <dd className="font-semibold text-cream">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <dt className="font-bold text-cream">Total due</dt>
                <dd className="display text-[22px] text-cream">
                  {formatMoney(29700 - 1485 - 2257 + 4820)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 rounded-md bg-cream/10 px-3 py-2 text-[10px] leading-relaxed text-cream/60">
              Resolved server-side at checkout from your account record — never from a client-supplied
              price.
            </p>
          </div>
        </div>
      </section>

      {/* Steps --------------------------------------------------- */}
      <section className="wrap py-14">
          <div className="card flex flex-wrap items-center justify-between gap-4 border-fern/25 bg-fern/5 p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-fern/12 p-2.5 text-fern">
                <FileSpreadsheet size={17} />
              </span>
              <div>
                <p className="text-[13px] font-bold">The order sheet travels with your PO</p>
                <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-ink/60">
                  Download the wholesale price list as an Excel workbook or CSV — SKUs, case tiers, MSRP,
                  carton dimensions and stock. Fill the quantity column, upload it back at{" "}
                  <Link href="/quick-order" className="font-bold underline">/quick-order</Link>, and we
                  resolve the pallet, freight and destination tax in one pass.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/api/order-sheet/download?format=xlsx" download className="btn btn-primary btn-sm">
                <Download size={13} /> Excel (.xlsx)
              </a>
              <a href="/api/order-sheet/download?format=csv" download className="btn btn-outline btn-sm">
                <Download size={13} /> CSV
              </a>
            </div>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {[
            {
              icon: FileCheck2,
              title: "1 · Apply",
              body: "Company, EIN, ship-to address, volume and categories. Four minutes, no documents needed yet.",
            },
            {
              icon: BadgeCheck,
              title: "2 · Verify",
              body: "We confirm your entity and resale certificate. A human reviews every application in Newark.",
            },
            {
              icon: Percent,
              title: "3 · Buy",
              body: "Contract pricing, tax exemption and quick order activate immediately on your account.",
            },
          ].map((step) => (
            <div key={step.title} className="card p-5">
              <span className="inline-flex rounded-full bg-fern/10 p-2.5 text-fern">
                <step.icon size={17} />
              </span>
              <h2 className="mt-3 text-[13.5px] font-bold">{step.title}</h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/60">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Terms -------------------------------------------------- */}
      <section id="terms" className="border-y border-ink/10 bg-[#fbf8f1] py-14">
        <div className="wrap">
          <div className="max-w-2xl">
            <p className="eyebrow">Pricing & payment terms</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[38px]">
              Three price layers, applied in a fixed order.
            </h2>
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Percent,
                title: "Volume tiers",
                body: "Every SKU stores up to three case-price breaks in the database. Buy 2, 5 or 10 cases and the tier resolves per line automatically.",
                points: ["Per-line, per-order resolution", "No coupon code needed", "Applies to guests too"],
              },
              {
                icon: CreditCard,
                title: "Payment terms",
                body: "Card at checkout via Stripe is always available. After two prepaid orders, approved accounts can request net 30 invoicing.",
                points: ["Stripe tokenised card", "Net 30 after two prepaid", "ACH on request over $2,500"],
              },
              {
                icon: PackageCheck,
                title: "Returns & damage",
                body: "Thirty days on unopened cases. Transit damage is credited with photos — 100% cover on ceramics and glassware.",
                points: ["30-day unopened returns", "Photo-based damage credit", "Return freight waived when ours"],
              },
            ].map((term) => (
              <div key={term.title} className="card p-5">
                <span className="inline-flex rounded-full bg-fern/10 p-2.5 text-fern">
                  <term.icon size={16} />
                </span>
                <h3 className="mt-3 text-[13.5px] font-bold">{term.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/60">{term.body}</p>
                <ul className="mt-3 space-y-1.5 border-t border-ink/8 pt-2.5">
                  {term.points.map((point) => (
                    <li key={point} className="flex items-start gap-1.5 text-[10.5px] text-ink/55">
                      <Check size={11} className="mt-0.5 shrink-0 text-fern" /> {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Freight ------------------------------------------------ */}
      <section id="freight" className="wrap py-14">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="eyebrow">Dimensional freight</p>
            <h2 className="display mt-2 text-[32px] leading-tight sm:text-[38px]">
              We bill the box, not a made-up flat rate.
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-ink/65">
              Every SKU stores carton weight and dimensions in inches. At checkout we compute dimensional
              weight using the carrier divisor of 139, compare it with actual weight, and take the greater
              as billable weight — then quote parcel and LTL services side by side against the destination
              ZIP.
            </p>
            <div className="mt-5 space-y-3">
              {[
                {
                  icon: Ruler,
                  title: "Dim weight formula",
                  body: "(L × W × H in inches) ÷ 139 = dimensional lb. Billed at the greater of actual vs dim weight plus 1.5 lb packaging.",
                },
                {
                  icon: Boxes,
                  title: "Pallet trigger",
                  body: "Billable weight over 150 lb, any carton over 40 lb, or over 12,000 cubic inches unlocks curbside LTL pricing with liftgate.",
                },
                {
                  icon: Truck,
                  title: "Carrier network",
                  body: "UPS Ground and 2nd Day Air for parcel; regional LTL partners for pallet builds. EasyPost live rates when configured.",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-lg border border-ink/10 bg-[#fffdf8] p-4">
                  <span className="mt-0.5 rounded-full bg-fern/10 p-2 text-fern">
                    <item.icon size={14} />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink/55">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink/10 bg-[#fffdf8]">
            <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-5 py-3">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
                <Calculator size={13} /> Worked freight examples
              </p>
              <span className="chip">FOB Newark 07102</span>
            </div>
            <div className="divide-y divide-ink/8">
              {FREIGHT_EXAMPLES.map((example) => (
                <div key={example.label} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] font-bold">{example.label}</p>
                      <p className="mt-0.5 text-[10.5px] text-ink/50">
                        {example.weight} · billable {example.billable}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold tabular-nums">{formatMoney(example.price)}</p>
                      <p className="text-[9.5px] font-semibold tracking-wide text-fern uppercase">
                        {example.mode}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink/40">{example.zone} · transit 2–6 business days</p>
                </div>
              ))}
            </div>
            <div className="border-t border-ink/10 bg-fern/5 px-5 py-3 text-[10.5px] leading-relaxed text-fern">
              Freight allowance: parcel freight is waived on orders over {formatMoney(SITE.freeFreightThreshold)} shipping
              to zones 1–6. LTL is always quoted at cost.
            </div>
          </div>
        </div>
      </section>

      {/* Tax ---------------------------------------------------- */}
      <section id="tax" className="border-y border-ink/10 bg-ink py-14 text-cream">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-bold tracking-[0.24em] text-gold uppercase">Sales tax nexus</p>
            <h2 className="display mt-2 text-[32px] leading-tight text-cream sm:text-[38px]">
              Tax is a function of the destination ZIP, not a guess.
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-cream/65">
              We collect destination-based sales tax where Meridian has nexus. The checkout engine resolves
              the jurisdiction from the ZIP and applies the combined state and local rate to goods plus
              taxable freight. Verified resale accounts are zero-rated automatically, with the certificate
              stored against the account record.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {[
                { state: "New Jersey", rate: "6.625%", note: "Origin state · nexus" },
                { state: "Maine", rate: "5.500%", note: "Resale exempt on file" },
                { state: "Texas", rate: "8.200%", note: "Destination district tax" },
                { state: "Oregon", rate: "0.000%", note: "No state sales tax" },
              ].map((row) => (
                <div key={row.state} className="rounded-lg border border-cream/15 bg-cream/[0.04] px-3.5 py-2.5">
                  <p className="text-[11.5px] font-bold text-cream">{row.state}</p>
                  <p className="text-[14px] font-semibold text-gold tabular-nums">{row.rate}</p>
                  <p className="text-[9.5px] text-cream/45">{row.note}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-cream/15 bg-cream/[0.05] p-6">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-sage uppercase">
              <ShieldCheck size={14} /> Resale exemption checklist
            </p>
            <ul className="mt-4 space-y-3">
              {DOCS.map((doc, index) => (
                <li key={doc} className="flex items-start gap-3 text-[12px] leading-relaxed text-cream/70">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cream/25 text-[9.5px] font-bold text-gold">
                    {index + 1}
                  </span>
                  {doc}
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-md bg-cream/10 px-3 py-2.5 text-[10.5px] leading-relaxed text-cream/60">
              Exemption is state-specific. If your certificate covers multiple states, send each one and we
              will mark the account exempt for every verified jurisdiction.
            </p>
            <Link href="/wholesale/apply" className="btn btn-light mt-5 w-full">
              Submit a resale certificate
            </Link>
          </div>
        </div>
      </section>

      {/* Requirements + CTA ------------------------------------- */}
      <section className="wrap py-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="eyebrow">Eligibility</p>
            <h2 className="display mt-2 text-[30px] leading-tight">
              Who we can open an account for.
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                "Independent grocery & convenience",
                "Independent pharmacy & clinic",
                "Gyms, studios & recovery spaces",
                "Gift, home & lifestyle boutiques",
                "Hotels, cafés & hospitality groups",
                "B2B resellers & distributors",
              ].map((item) => (
                <p key={item} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink/70">
                  <Check size={14} className="mt-0.5 shrink-0 text-fern" /> {item}
                </p>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-ink/12 bg-parchment/40 p-4">
              <Clock size={15} className="mt-0.5 shrink-0 text-fern" />
              <p className="text-[11px] leading-relaxed text-ink/60">
                Not a retailer yet? You can still order at catalog case pricing as a guest. Trade
                approval is only required for contract pricing, tax exemption and net terms.
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-moss p-6 text-cream">
            <p className="text-[10.5px] font-bold tracking-[0.2em] text-gold uppercase">Ready when you are</p>
            <h3 className="display mt-2 text-[27px] leading-tight text-cream">
              Four minutes now, better margins next week.
            </h3>
            <p className="mt-2.5 text-[12px] leading-relaxed text-cream/65">
              One application covers all three departments. No fees, no volume commitment, no auto-renewal.
            </p>
            <Link href="/wholesale/apply" className="btn btn-light mt-5 w-full">
              Start application <ArrowRight size={15} />
            </Link>
            <p className="mt-3 text-center text-[10px] text-cream/45">
              Already approved? <Link href="/login" className="underline">Sign in to your trade portal</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
