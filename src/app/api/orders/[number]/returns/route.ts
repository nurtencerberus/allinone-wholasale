import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { OrderActionError, requestReturn } from "@/lib/order-admin";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** The buyer asks to return cases from a delivered order (14-day window). */
export async function POST(request: Request, context: { params: Promise<{ number: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in to request a return." }, { status: 401 });
    const limit = await consumeRateLimit("return-request", `${user.id}|${clientIp(request)}`, 10, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const { number } = await context.params;
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, number)).limit(1);
    // Only the account that placed the order (or its verified e-mail owner) may return it.
    const owns =
      order &&
      (order.userId === user.id || (user.emailVerified && order.email.toLowerCase() === user.email.toLowerCase()));
    if (!order || !owns) return Response.json({ error: "Order not found." }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      items?: { orderItemId?: number; cases?: number }[];
      reason?: string;
      note?: string;
    };
    const created = await requestReturn({
      order,
      userId: user.id,
      items: (body.items ?? []).map((item) => ({ orderItemId: Number(item.orderItemId), cases: Math.round(Number(item.cases)) })),
      reason: String(body.reason ?? ""),
      note: body.note ? String(body.note) : null,
    });
    return Response.json({ ok: true, rmaNumber: created.rmaNumber });
  } catch (error) {
    if (error instanceof OrderActionError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[return-request]", error);
    return Response.json({ error: "Could not submit the return request." }, { status: 500 });
  }
}
