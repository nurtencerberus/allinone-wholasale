import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { acceptQuote, QuoteError, setQuoteStatus } from "@/lib/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The buyer's two moves on their own quote: accept the prices, or withdraw the request. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });

    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Unknown quote." }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const actor = { id: user.id, email: user.email };

    if (body.action === "accept") {
      const quote = await acceptQuote(id, user, request);
      return Response.json({
        ok: true,
        quote,
        message: "Accepted. The agreed prices now apply to your orders until the quote expires.",
      });
    }
    if (body.action === "withdraw") {
      const quote = await setQuoteStatus({ quoteId: id, to: "withdrawn", actor, user, request });
      return Response.json({ ok: true, quote, message: "Request withdrawn." });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof QuoteError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[quote-decide]", error);
    return Response.json({ error: "Could not update the quote." }, { status: 500 });
  }
}
