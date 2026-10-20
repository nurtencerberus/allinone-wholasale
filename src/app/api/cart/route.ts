import { getSessionUser } from "@/lib/auth";
import { cartView } from "@/lib/cart-view";
import type { CartItemInput } from "@/lib/checkout";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";

/**
 * Prices the browser's cart for display (SEP-3). The browser sends only `{ productId, cases }`;
 * names, pack sizes and prices come back from the database, and prices only for an account that
 * may see them — so nothing in local storage can keep showing wholesale pricing after sign-out.
 */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json().catch(() => ({}))) as { items?: CartItemInput[] };
    const user = await getSessionUser();
    const view = await cartView(Array.isArray(body.items) ? body.items : [], user);
    return Response.json({ ok: true, cart: view });
  } catch (error) {
    console.error("[cart-view]", error);
    return Response.json({ error: "Could not load this cart." }, { status: 500 });
  }
}
