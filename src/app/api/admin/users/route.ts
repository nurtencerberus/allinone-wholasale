import { desc } from "drizzle-orm";
import { db } from "@/db";
import { orders, users, wholesaleApplications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

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

    const accounts = userRows.map((user) => {
      const entry = stats.get(user.id) ?? { orderCount: 0, totalSpend: 0, lastOrderAt: null };
      const application = applicationByEmail.get(user.email.toLowerCase());
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
        createdAt: user.createdAt.toISOString(),
        orderCount: entry.orderCount,
        totalSpend: entry.totalSpend,
        lastOrderAt: entry.lastOrderAt ? entry.lastOrderAt.toISOString() : null,
        applicationStatus: application?.status ?? null,
        isSelf: user.id === admin.id,
      };
    });

    const filtered = query
      ? accounts.filter((account) =>
          [account.name, account.email, account.company ?? "", account.ein ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : accounts;

    return Response.json({
      ok: true,
      accounts: filtered,
      totals: {
        accounts: accounts.length,
        wholesale: accounts.filter((account) => account.accountTier === "wholesale").length,
        unverified: accounts.filter((account) => !account.emailVerified).length,
        taxExempt: accounts.filter((account) => account.taxExempt).length,
        revenue: orderRows.reduce((sum, order) => sum + order.total, 0),
        guestOrders: orderRows.filter((order) => order.userId === null).length,
      },
    });
  } catch (error) {
    console.error("[admin-users]", error);
    return Response.json({ error: "Could not load accounts." }, { status: 500 });
  }
}
