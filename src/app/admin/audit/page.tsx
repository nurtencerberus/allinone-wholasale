import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, History } from "lucide-react";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = {
  title: "Admin · audit log",
  robots: { index: false, follow: false },
};

const ENTITY_TYPES = ["user", "application", "product", "inventory", "order", "return", "list", "catalog"];

function describe(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "—";
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${typeof entry === "object" ? JSON.stringify(entry) : String(entry)}`)
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireStaffPage("staff", "/admin/audit");
  const { type } = await searchParams;
  const filter = type && ENTITY_TYPES.includes(type) ? type : undefined;

  const rows = await db
    .select()
    .from(auditLog)
    .where(filter ? eq(auditLog.entityType, filter) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(300);

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Audit log</h1>
          <p className="mt-1.5 text-[11.5px] text-cream/55">
            Every staff change to accounts, prices, stock, orders and refunds. Entries cannot be edited.
          </p>
        </div>
        <AdminNav />
      </section>
      <div className="wrap py-8">
        <div className="flex flex-wrap gap-2">
          {[undefined, ...ENTITY_TYPES].map((entry) => (
            <Link
              key={entry ?? "all"}
              href={entry ? `/admin/audit?type=${entry}` : "/admin/audit"}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold capitalize ${
                filter === entry ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink/60 hover:border-ink/40"
              }`}
            >
              {entry ?? "All"}
            </Link>
          ))}
        </div>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
              <tr className="border-b border-ink/8">
                <th className="px-4 py-2.5">When</th>
                <th className="px-2 py-2.5">Who</th>
                <th className="px-2 py-2.5">Action</th>
                <th className="px-2 py-2.5">Record</th>
                <th className="px-2 py-2.5">Before</th>
                <th className="px-4 py-2.5">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink/5 align-top last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink/60">
                    {row.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })}
                  </td>
                  <td className="px-2 py-2.5">
                    {row.actorEmail}
                    {row.ip ? <span className="block text-[9.5px] text-ink/40">{row.ip}</span> : null}
                  </td>
                  <td className="px-2 py-2.5 font-semibold">{row.action}</td>
                  <td className="px-2 py-2.5 text-ink/60">
                    {row.entityType} {row.entityId ? `#${row.entityId}` : ""}
                  </td>
                  <td className="max-w-[260px] px-2 py-2.5 break-words text-ink/55">{describe(row.before)}</td>
                  <td className="max-w-[260px] px-4 py-2.5 break-words">{describe(row.after)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink/45">
                    <History size={22} className="mx-auto mb-2 text-ink/25" />
                    No entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
