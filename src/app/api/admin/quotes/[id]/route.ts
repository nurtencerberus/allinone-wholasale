import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff, staffDenied } from "@/lib/auth";
import { loadQuote, QuoteError, sendQuote, setQuoteStatus } from "@/lib/quotes";
import { escapeHtml, sendEmail } from "@/lib/email";
import { appOrigin } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The trade desk prices a request and sends it, or turns it down. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Unknown quote." }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      prices?: { quoteItemId: number; casePrice: number }[];
      validDays?: number;
      note?: string;
    };

    if (body.action === "send") {
      const quote = await sendQuote({
        quoteId: id,
        actor: admin,
        prices: Array.isArray(body.prices) ? body.prices : [],
        validDays: Number(body.validDays),
        note: body.note ?? null,
        request,
      });
      const [account] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, quote.userId)).limit(1);
      if (account) {
        try {
          await sendEmail({
            to: account.email,
            subject: `Your quote ${quote.reference} is ready`,
            html: `<p>${escapeHtml(account.name.split(" ")[0])}, the prices you asked for are ready and stand until ${escapeHtml(quote.expiresAt?.toDateString() ?? "")}.</p><p><a href="${appOrigin()}/account/quotes">Review and accept the quote</a></p>`,
          });
        } catch (error) {
          console.error("[quote-send-email]", error);
        }
      }
      return Response.json({ ok: true, quote, message: `${quote.reference} sent to the buyer.` });
    }

    if (body.action === "decline") {
      const note = String(body.note ?? "").trim();
      if (note.length < 5) return Response.json({ error: "Give the buyer a reason." }, { status: 400 });
      const quote = await setQuoteStatus({ quoteId: id, to: "declined", actor: admin, note, request });
      return Response.json({ ok: true, quote, message: `${quote.reference} declined.` });
    }

    await loadQuote(id);
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof QuoteError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[admin-quote]", error);
    return Response.json({ error: "Could not update the quote." }, { status: 500 });
  }
}
