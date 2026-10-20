import { and, eq, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginChallenges, orders, products, rateLimits, sessions } from "@/db/schema";
import { sweepStaleCheckouts } from "@/lib/card-checkout";
import { abandonedCarts, markCartReminded } from "@/lib/cart-store";
import { abandonedCartTemplate, escapeHtml, sendEmail } from "@/lib/email";
import { pullExpiringLots, stockDrift } from "@/lib/inventory";
import { cancelOrderAndRestock } from "@/lib/orders";
import { appOrigin, SITE } from "@/lib/site";

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
      await db.update(orders).set({ paymentStatus: "void" }).where(eq(orders.id, order.id));
      cancelled.push(order.orderNumber);
    }
  }
  report.unpaidAchCancelled = cancelled;

  // 3. Lots close to their best-by date stop being sold.
  const expiry = await pullExpiringLots();
  report.lotsPulled = expiry.pulled;
  if (expiry.failed.length) {
    report.lotsPullFailed = expiry.failed;
    console.error("[cron-expiry-pull]", JSON.stringify(expiry.failed));
  }

  // 4. Low stock: one daily digest to the trade desk.
  const low = await db
    .select({ sku: products.sku, name: products.name, stock: products.stock, reorderPoint: products.reorderPoint })
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, products.reorderPoint)))
    .orderBy(products.stock)
    .limit(100);
  report.lowStock = low.length;
  if (low.length) {
    try {
      await sendEmail({
        to: process.env.OPS_EMAIL?.trim() || SITE.email,
        subject: `${low.length} SKU(s) at or below reorder point`,
        html: `<p>These products are at or below their reorder point:</p><ul>${low
          .map((row) => `<li>${escapeHtml(row.sku)} — ${escapeHtml(row.name)}: ${row.stock} cases (reorder at ${row.reorderPoint})</li>`)
          .join("")}</ul><p><a href="${appOrigin()}/admin/inventory">Open inventory</a></p>`,
      });
    } catch (error) {
      console.error("[cron-low-stock]", error);
    }
  }

  // 5. One reminder for a cart a trade buyer left sitting (SEP-7).
  const waiting = await abandonedCarts();
  const reminded: string[] = [];
  for (const cart of waiting) {
    try {
      const template = abandonedCartTemplate({ name: cart.name, lines: cart.lines, url: `${appOrigin()}/checkout` });
      await sendEmail({ to: cart.email, subject: template.subject, html: template.html });
      await markCartReminded(cart.cartId);
      reminded.push(cart.email);
    } catch (error) {
      console.error("[cron-cart-reminder]", cart.cartId, error);
    }
  }
  report.cartsReminded = reminded.length;

  // 6. products.stock must equal the sellable lots; anything else is a bug worth knowing about.
  const drift = await stockDrift();
  report.stockDrift = drift;
  if (drift.length) console.error("[cron-stock-drift]", JSON.stringify(drift));

  // 7. Expired sessions, sign-in challenges and rate-limit windows.
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, new Date()));
  report.sessionsDeleted = (await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ t: sessions.token })).length;
  report.rateLimitsDeleted = (await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date())).returning({ k: rateLimits.key })).length;

  console.log("[cron-maintenance]", JSON.stringify(report));
  return Response.json({ ok: true, ...report });
}
