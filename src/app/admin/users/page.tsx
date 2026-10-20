import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck, UserCog, Users } from "lucide-react";
import { db } from "@/db";
import { orders, users, wholesaleApplications } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminUsers, type AdminAccount, type AdminAccountTotals } from "@/components/admin/AdminUsers";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Admin · accounts",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const session = await requireStaffPage("view", "/admin/users");

  const [userRows, orderRows, applicationRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select().from(orders),
    db.select().from(wholesaleApplications),
  ]);

  const stats = new Map<number, { orderCount: number; totalSpend: number; lastOrderAt: Date | null }>();
  for (const order of orderRows) {
    if (order.userId === null) continue;
    const entry = stats.get(order.userId) ?? { orderCount: 0, totalSpend: 0, lastOrderAt: null };
    entry.orderCount += 1;
    entry.totalSpend += order.total;
    if (!entry.lastOrderAt || order.createdAt > entry.lastOrderAt) entry.lastOrderAt = order.createdAt;
    stats.set(order.userId, entry);
  }
  const applicationByEmail = new Map(
    applicationRows.map((application) => [application.email.toLowerCase(), application]),
  );

  const accounts: AdminAccount[] = userRows.map((user) => {
    const entry = stats.get(user.id) ?? { orderCount: 0, totalSpend: 0, lastOrderAt: null };
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
      phone: user.phone,
      role: user.role,
      accountTier: user.accountTier,
      wholesaleDiscountPct: user.wholesaleDiscountPct,
      taxExempt: user.taxExempt,
      taxExemptState: user.taxExemptState,
      taxExemptCertNumber: user.taxExemptCertNumber,
      ein: user.ein,
      emailVerified: user.emailVerified,
      twoFactorEnabled: Boolean(user.totpEnabledAt && user.totpSecret),
      createdAt: user.createdAt.toISOString(),
      orderCount: entry.orderCount,
      totalSpend: entry.totalSpend,
      lastOrderAt: entry.lastOrderAt ? entry.lastOrderAt.toISOString() : null,
      applicationStatus: applicationByEmail.get(user.email.toLowerCase())?.status ?? null,
      isSelf: user.id === session.id,
    };
  });

  const totals: AdminAccountTotals = {
    accounts: accounts.length,
    wholesale: accounts.filter((account) => account.accountTier === "wholesale").length,
    unverified: accounts.filter((account) => !account.emailVerified).length,
    taxExempt: accounts.filter((account) => account.taxExempt).length,
    revenue: orderRows.reduce((sum, order) => sum + order.total, 0),
    guestOrders: orderRows.filter((order) => order.userId === null).length,
  };

  const topAccounts = [...accounts].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream"
            >
              <ArrowLeft size={12} /> Admin console
            </Link>
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">
              Accounts & buyers
            </h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              Contract pricing, resale tax exemption, roles and email verification — applied server-side
              on the next quote.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/orders" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
              Order tracking
            </Link>
            <Link href="/admin#applications" className="btn btn-light btn-sm">
              Applications
            </Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Registered accounts", value: `${totals.accounts}`, icon: Users },
            { label: "Wholesale approved", value: `${totals.wholesale}`, icon: ShieldCheck },
            { label: "Awaiting confirmation", value: `${totals.unverified}`, icon: UserCog },
            { label: "Tracked revenue", value: formatMoney(totals.revenue, { decimals: false }), icon: ShieldCheck },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.12em] text-ink/65 uppercase">{stat.label}</p>
                <stat.icon size={15} className="text-fern" />
              </div>
              <p className="display mt-2 text-[26px] leading-none">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <AdminUsers
            initialAccounts={accounts}
            totals={totals}
            canManageAccounts={hasPermission(session, "accounts")}
            canManageStaff={hasPermission(session, "staff")}
          />
        </div>

        <div className="mt-6 card p-4">
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase">Top accounts by lifetime value</p>
          <ul className="mt-3 space-y-2">
            {topAccounts.map((account, index) => (
              <li key={account.id} className="flex items-center justify-between border-b border-ink/8 pb-1.5 text-[11.5px] last:border-0">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fern/12 text-[9px] font-bold text-fern">
                    {index + 1}
                  </span>
                  <span>
                    <span className="font-semibold">{account.name}</span>
                    <span className="ml-1.5 text-[10px] text-ink/65">{account.company ?? account.email}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[10px] text-ink/65">{account.orderCount} orders</span>
                  <span className="font-bold tabular-nums">{formatMoney(account.totalSpend)}</span>
                </span>
              </li>
            ))}
            {topAccounts.length === 0 ? (
              <li className="text-[11px] text-ink/65">No accounts yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
