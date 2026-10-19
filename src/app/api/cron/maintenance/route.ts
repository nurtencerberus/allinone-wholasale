import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, rateLimits, sessions } from "@/db/schema";
import { sweepStaleCheckouts } from "@/lib/card-checkout";
import { cancelOrderAndRestock } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Days an ACH / wire order may wait for funds before it is cancelled and its stock released. */
const UNPAID_ACH_DAYS = 7;

/**
 * Daily housekeeping, triggered by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const report: Record<string, unknown> = {};

  // 1. Card checkouts the browser and the webhook both missed.
  report.cardCheckouts = await sweepStaleCheckouts();

  // 2. Unpaid ACH / wire orders: cancel and return the stock.
  const overdue = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        eq(orders.paymentMethod, "ach"),
        eq(orders.paymentStatus, "awaiting_payment"),
        eq(orders.status, "processing"),
        lt(orders.createdAt, sql`now() - make_interval(days => ${UNPAID_ACH_DAYS})`),
      ),
    )
    .limit(200);
  const cancelled: string[] = [];
  for (const order of overdue) {
    if (await cancelOrderAndRestock(order.id, `ACH payment not received within ${UNPAID_ACH_DAYS} days`)) {
      cancelled.push(order.orderNumber);
    }
  }
  report.unpaidAchCancelled = cancelled;

  // 3. Expired sessions and rate-limit windows.
  report.sessionsDeleted = (await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ t: sessions.token })).length;
  report.rateLimitsDeleted = (await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date())).returning({ k: rateLimits.key })).length;

  console.log("[cron-maintenance]", JSON.stringify(report));
  return Response.json({ ok: true, ...report });
}
