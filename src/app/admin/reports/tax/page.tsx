import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { stateName } from "@/lib/site";
import { NEXUS_WATCH, parseMonth, taxReport } from "@/lib/tax-report";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = {
  title: "Admin · sales tax",
  robots: { index: false, follow: false },
};

export default async function TaxReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaffPage("reports", "/admin/reports/tax");
  const month = parseMonth((await searchParams).month);
  const report = await taxReport(month);

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Sales tax report</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            Figures for the NJ sales and use tax return (ST-50/ST-51), by order date in New York time. Cancelled orders are
            excluded; refunds on returns count in the month they were paid. Have your accountant confirm before filing.
          </p>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <form className="flex flex-wrap items-end gap-2" action="/admin/reports/tax">
          <div>
            <label className="label" htmlFor="month">Month</label>
            <input id="month" name="month" type="month" defaultValue={month} className="field" />
          </div>
          <button className="btn btn-outline btn-sm" type="submit">Show</button>
          <a className="btn btn-primary btn-sm" href={`/api/admin/reports/tax?month=${month}`}>
            <Download size={13} /> CSV
          </a>
        </form>

        {report.nexus.map((row) => (
          <section key={row.state} className="card mt-5 p-5">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">{stateName(row.state)} · {month}</p>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
              {[
                ["Orders delivered to the state", String(row.orders)],
                ["Gross sales (goods, after discounts)", formatMoney(row.grossSales)],
                ["Freight charged", formatMoney(row.freight)],
                ["Taxable goods", formatMoney(row.taxableGoods)],
                ["Taxable freight (share on taxable goods)", formatMoney(row.taxableFreight)],
                ["Exempt — food & dietary supplements", formatMoney(row.exemptFoodSupplement)],
                ["Exempt — resale certificate on file", formatMoney(row.exemptResale)],
                ["Sales tax collected", formatMoney(row.taxCollected)],
                ["Returns refunded this month — goods", `−${formatMoney(row.returnsGoods)}`],
                ["Returns refunded this month — tax", `−${formatMoney(row.returnsTax)}`],
                ["Net tax for the month", formatMoney(row.taxCollected - row.returnsTax)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-ink/8 pb-1.5">
                  <dt className="text-ink/60">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section className="card mt-5 p-5">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Other states · last 12 months (no tax collected)</p>
          <p className="mt-1 text-[11px] text-ink/55">
            Economic nexus watch: many states require registration above {formatMoney(NEXUS_WATCH.revenue, { decimals: false })} or{" "}
            {NEXUS_WATCH.transactions} transactions a year. Rows at 75% of either are flagged.
          </p>
          <table className="mt-3 w-full text-left text-[12px]">
            <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
              <tr className="border-b border-ink/10">
                <th className="py-2">State</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Sales</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {report.others.map((row) => (
                <tr key={row.state} className="border-b border-ink/6">
                  <td className="py-1.5">{stateName(row.state)}</td>
                  <td className="text-right tabular-nums">{row.orders}</td>
                  <td className="text-right tabular-nums">{formatMoney(row.sales)}</td>
                  <td className="pl-3 text-right">{row.watch ? <span className="rounded-full bg-clay/15 px-2 py-0.5 text-[9px] font-bold text-clay uppercase">Review nexus</span> : null}</td>
                </tr>
              ))}
              {report.others.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-ink/45">No out-of-state sales yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
