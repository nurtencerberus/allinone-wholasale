import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";

export const ORDER_COOKIE_PREFIX = "mo_";

function sameToken(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Who may open an order confirmation / invoice page:
 *  - staff with read access,
 *  - the signed-in account that placed it (or that owns the order e-mail),
 *  - anyone holding the order's unguessable access key (link in the e-mail, or the
 *    cookie set in the browser that placed the order).
 */
export async function canViewOrder(
  order: { orderNumber: string; userId: number | null; email: string; accessToken: string | null },
  user: SessionUser | null,
  tokenFromUrl?: string | null,
): Promise<boolean> {
  if (hasPermission(user, "view")) return true;
  if (user && order.userId !== null && order.userId === user.id) return true;
  if (user && user.emailVerified && user.email.toLowerCase() === order.email.toLowerCase()) return true;
  if (sameToken(order.accessToken, tokenFromUrl)) return true;
  const jar = await cookies();
  return sameToken(order.accessToken, jar.get(`${ORDER_COOKIE_PREFIX}${order.orderNumber}`)?.value);
}
