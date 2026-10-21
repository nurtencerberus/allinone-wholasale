import { requireStaff, staffDenied } from "@/lib/auth";
import { agingReport } from "@/lib/credit";
import { matrixToCsv } from "@/lib/spreadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ODE-6: the aging report as CSV, for the bookkeeper. */
export async function GET() {
  const admin = await requireStaff("reports");
  if (!admin) return staffDenied();

  const rows = await agingReport();
  const matrix = [
    ["Account", "Email", "Not due", "1-30", "31-60", "61-90", "90+", "Total", "Credit limit", "Oldest due"],
    ...rows.map((row) => [
      row.company,
      row.email,
      (row.buckets.current / 100).toFixed(2),
      (row.buckets["1-30"] / 100).toFixed(2),
      (row.buckets["31-60"] / 100).toFixed(2),
      (row.buckets["61-90"] / 100).toFixed(2),
      (row.buckets["90+"] / 100).toFixed(2),
      (row.total / 100).toFixed(2),
      (row.creditLimit / 100).toFixed(2),
      row.oldestDueAt ? row.oldestDueAt.slice(0, 10) : "",
    ]),
  ];

  return new Response(matrixToCsv(matrix), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="receivables-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
