import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { agingReport, type AgingBucket } from "@/lib/credit";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = {
  title: "Admin · receivables",
  robots: { index: false, follow: false },
};

const BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];
const HEADINGS: Record<AgingBucket, string> = {
  current: "Not due",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

export default async function ReceivablesPage() {
  await requireStaffPage("reports", "/admin/reports/ar");
  const rows = await agingReport();
  const totals = BUCKETS.reduce(
    (acc, bucket) => ({ ...acc, [bucket]: rows.reduce((sum, row) => sum + row.buckets[bucket], 0) }),
    {} as Record<AgingBucket, number>,
  );
  const grand = rows.reduce((sum, row) => sum + row.total, 0);
  const overdue = grand - totals.current;

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Receivables</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            Every invoice order still waiting to be paid, by how far past its due date it is. Cancelled orders are
            excluded and refunds are already deducted. An account with anything overdue cannot order on terms again
            until it is settled.
          </p>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">Outstanding</p>
            <p className="display mt-1 text-[26px]">{formatMoney(grand)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">Past due</p>
            <p className={`display mt-1 text-[26px] ${overdue > 0 ? "text-clay" : ""}`}>{formatMoney(overdue)}</p>
          </div>
          <div className="card flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">Accounts</p>
              <p className="display mt-1 text-[26px]">{rows.length}</p>
            </div>
            <a href="/api/admin/reports/ar" className="btn btn-outline btn-sm" download>
              <Download size={13} /> CSV
            </a>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead className="border-b border-ink/10 bg-parchment/50 text-[10px] font-bold tracking-[0.12em] uppercase text-ink/65">
              <tr>
                <th scope="col" className="px-4 py-2.5">Account</th>
                {BUCKETS.map((bucket) => (
                  <th scope="col" key={bucket} className="px-3 py-2.5 text-right">
                    {HEADINGS[bucket]}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5 text-right">Total</th>
                <th scope="col" className="px-4 py-2.5 text-right">Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink/65">
                    Nothing outstanding — every invoice has been settled.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const late = row.total - row.buckets.current;
                return (
                  <tr key={`${row.accountId}-${row.email}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.company}</p>
                      <p className="text-[10.5px] text-ink/65">{row.email}</p>
                    </td>
                    {BUCKETS.map((bucket) => (
                      <td
                        key={bucket}
                        className={`px-3 py-3 text-right tabular-nums ${bucket !== "current" && row.buckets[bucket] > 0 ? "text-clay" : "text-ink/72"}`}
                      >
                        {row.buckets[bucket] ? formatMoney(row.buckets[bucket]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(row.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/72">
                      {row.creditLimit ? formatMoney(row.creditLimit) : "none"}
                      {late > 0 ? <span className="ml-1.5 text-[10px] font-bold text-clay">ON HOLD</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length ? (
              <tfoot className="border-t border-ink/15 bg-parchment/40 font-bold">
                <tr>
                  <td className="px-4 py-3">All accounts</td>
                  {BUCKETS.map((bucket) => (
                    <td key={bucket} className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals[bucket])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(grand)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
