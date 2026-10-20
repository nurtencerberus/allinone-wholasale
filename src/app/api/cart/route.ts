import { getSessionUser } from "@/lib/auth";
import { cartView } from "@/lib/cart-view";
import { loadCart, mergeIntoCart, saveCart } from "@/lib/cart-store";
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

/**
 * The signed-in buyer's cart on the server (SEP-7).
 *
 * GET returns it (what a second device starts from). PUT replaces it with what the browser now
 * holds. PATCH merges the browser's lines into it, taking the larger quantity of each line, and
 * is what the browser calls once after signing in. A guest gets an empty answer and no error:
 * their cart simply stays in local storage.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ ok: true, items: [], stored: false });
  return Response.json({ ok: true, items: await loadCart(user.id), stored: true });
}

export async function PUT(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: true, items: [], stored: false });
    const body = (await request.json().catch(() => ({}))) as { items?: CartItemInput[] };
    const items = await saveCart(user.id, Array.isArray(body.items) ? body.items : []);
    return Response.json({ ok: true, items, stored: true });
  } catch (error) {
    console.error("[cart-save]", error);
    return Response.json({ error: "Could not save this cart." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: true, items: [], stored: false });
    const body = (await request.json().catch(() => ({}))) as { items?: CartItemInput[] };
    const items = await mergeIntoCart(user.id, Array.isArray(body.items) ? body.items : []);
    return Response.json({ ok: true, items, stored: true });
  } catch (error) {
    console.error("[cart-merge]", error);
    return Response.json({ error: "Could not load your saved cart." }, { status: 500 });
  }
}
