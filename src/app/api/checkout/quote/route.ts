import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { priceCart, type CartItemInput, type CheckoutAddress } from "@/lib/checkout";
import { ensureSeeded } from "@/lib/seed";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as {
      items?: CartItemInput[];
      couponCode?: string;
      address?: CheckoutAddress | null;
      shippingOptionId?: string | null;
    };

    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });
    const priced = await priceCart({
      items: body.items ?? [],
      user,
      couponCode: body.couponCode ?? null,
      address: body.address ?? null,
      shippingOptionId: body.shippingOptionId ?? null,
    });

    if ("error" in priced) return Response.json({ error: priced.error }, { status: 400 });
    return Response.json({ ok: true, quote: priced });
  } catch (error) {
    console.error("[checkout-quote]", error);
    return Response.json({ error: "Could not price this cart." }, { status: 500 });
  }
}
