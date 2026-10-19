import { requireStaff, staffDenied } from "@/lib/auth";
import { parseMonth, taxReport, taxReportCsv } from "@/lib/tax-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monthly sales-tax figures as CSV for the accountant. */
export async function GET(request: Request) {
  const staff = await requireStaff("reports");
  if (!staff) return staffDenied();
  const month = parseMonth(new URL(request.url).searchParams.get("month") ?? undefined);
  const report = await taxReport(month);
  return new Response(taxReportCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-tax-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
