import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createQuoteRequest, listQuotes, QuoteError, type QuoteLineInput } from "@/lib/quotes";
import { escapeHtml, sendEmail } from "@/lib/email";
import { appOrigin, SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UX-7: a trade buyer asks the desk for a price on specific quantities. A quote carries prices,
 * so it is open to approved trade accounts only — the same lock as the rest of the storefront.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });
  return Response.json({ ok: true, quotes: await listQuotes(user) });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });

    const limit = await consumeRateLimit("quote-request", `${user.id}:${clientIp(request)}`, 5, 60 * 60);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as { items?: QuoteLineInput[]; note?: string };
    const created = await createQuoteRequest({
      user,
      lines: Array.isArray(body.items) ? body.items : [],
      note: body.note ?? null,
    });

    try {
      await sendEmail({
        to: process.env.OPS_EMAIL?.trim() || SITE.email,
        subject: `Quote request ${created.reference}`,
        html: `<p>${escapeHtml(user.company ?? user.name)} asked for a price.</p><p><a href="${appOrigin()}/admin/quotes">Open the quote queue</a></p>`,
      });
    } catch (error) {
      console.error("[quote-request-email]", error);
    }

    return Response.json({ ok: true, ...created, message: `Request ${created.reference} is with the trade desk.` });
  } catch (error) {
    if (error instanceof QuoteError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[quote-request]", error);
    return Response.json({ error: "Could not send the request." }, { status: 500 });
  }
}
