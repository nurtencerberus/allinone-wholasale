import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { pgConstraint } from "@/db/errors";
import { accountPrices, products, quoteItems, quoteRequests, users, type QuoteRequest } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { MAX_QUOTE_LINES, QUOTE_STATUSES, QUOTE_VALID_DAYS, type QuoteStatus, type QuoteView } from "@/lib/quotes-view";

export { MAX_QUOTE_LINES, QUOTE_STATUSES, QUOTE_VALID_DAYS };
export type { QuoteStatus, QuoteView };

/**
 * UX-7: requests for quote.
 *
 * A trade buyer asks for a price on specific quantities; the desk prices each line and puts a
 * deadline on it; accepting turns those prices into `account_prices` rows, so the buyer's next
 * order picks them up without anyone re-keying anything. A quote only ever contains prices for
 * the account that asked for it — the same lock as the rest of the storefront.
 */

/** Who may move a quote where. The desk prices and declines; the buyer accepts or withdraws. */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  requested: ["quoted", "declined", "withdrawn"],
  quoted: ["accepted", "declined", "expired", "withdrawn"],
  accepted: [],
  declined: [],
  expired: [],
  withdrawn: [],
};

export class QuoteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type QuoteLineInput = { productId: number; cases: number; note?: string | null };

export function canTransition(from: string, to: QuoteStatus): boolean {
  return (QUOTE_TRANSITIONS[from as QuoteStatus] ?? []).includes(to);
}

function newReference(): string {
  return `RFQ-${randomInt(100000, 1000000)}`;
}

/** Merge duplicates, drop junk, cap the list. */
export function cleanQuoteLines(lines: QuoteLineInput[]): QuoteLineInput[] {
  const merged = new Map<number, QuoteLineInput>();
  for (const line of lines ?? []) {
    const productId = Number(line?.productId);
    const cases = Number(line?.cases);
    if (!Number.isInteger(productId) || productId < 1) continue;
    if (!Number.isFinite(cases) || cases <= 0) continue;
    const existing = merged.get(productId);
    merged.set(productId, {
      productId,
      cases: Math.min(999, (existing?.cases ?? 0) + Math.ceil(cases)),
      note: line.note?.trim().slice(0, 200) || existing?.note || null,
    });
  }
  return [...merged.values()].slice(0, MAX_QUOTE_LINES);
}

export async function createQuoteRequest(input: {
  user: SessionUser;
  lines: QuoteLineInput[];
  note: string | null;
}): Promise<{ id: number; reference: string }> {
  const lines = cleanQuoteLines(input.lines);
  if (!lines.length) throw new QuoteError("Add at least one product to ask for a price.");

  const rows = await db
    .select({ id: products.id, active: products.active })
    .from(products)
    .where(inArray(products.id, lines.map((line) => line.productId)));
  const live = new Set(rows.filter((row) => row.active).map((row) => row.id));
  const wanted = lines.filter((line) => live.has(line.productId));
  if (!wanted.length) throw new QuoteError("None of those products are available any more.");

  // One open request at a time keeps the desk's queue honest and stops double submissions.
  const [open] = await db
    .select({ id: quoteRequests.id, reference: quoteRequests.reference })
    .from(quoteRequests)
    .where(and(eq(quoteRequests.userId, input.user.id), inArray(quoteRequests.status, ["requested", "quoted"])))
    .limit(1);
  if (open) {
    throw new QuoteError(`You already have an open request (${open.reference}). Withdraw it before asking for another.`, 409);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = newReference();
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(quoteRequests)
          .values({
            reference,
            userId: input.user.id,
            customerNote: input.note?.trim().slice(0, 1000) || null,
          })
          .returning({ id: quoteRequests.id, reference: quoteRequests.reference });
        await tx.insert(quoteItems).values(
          wanted.map((line) => ({ quoteId: row.id, productId: line.productId, cases: line.cases, note: line.note ?? null })),
        );
        return row;
      });
    } catch (error) {
      if (pgConstraint(error) === "quote_requests_reference_unique") continue;
      throw error;
    }
  }
  throw new QuoteError("Could not open the request. Try again.", 500);
}

export type QuotePriceInput = { quoteItemId: number; casePrice: number };

/**
 * The desk prices every line and sets the deadline. Prices arrive in cents and are stored as
 * given; `priceCart()` is what ultimately charges them, through the account price list.
 */
export async function sendQuote(input: {
  quoteId: number;
  actor: AuditActor;
  prices: QuotePriceInput[];
  validDays: number;
  note: string | null;
  request?: Request;
}): Promise<QuoteRequest> {
  const quote = await loadQuote(input.quoteId);
  if (!canTransition(quote.status, "quoted")) {
    throw new QuoteError(`A ${quote.status} request cannot be quoted.`, 409);
  }
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id));
  const byId = new Map(input.prices.map((price) => [Number(price.quoteItemId), Math.round(Number(price.casePrice))]));

  for (const item of items) {
    const price = byId.get(item.id);
    if (price === undefined || !Number.isInteger(price) || price < 1) {
      throw new QuoteError("Every line needs a price before the quote can go out.");
    }
  }
  const days = Number.isInteger(input.validDays) && input.validDays > 0 ? Math.min(input.validDays, 180) : QUOTE_VALID_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(quoteItems).set({ casePrice: byId.get(item.id)! }).where(eq(quoteItems.id, item.id));
    }
    const [row] = await tx
      .update(quoteRequests)
      .set({
        status: "quoted",
        adminNote: input.note?.trim().slice(0, 1000) || null,
        expiresAt,
        quotedBy: typeof input.actor === "object" ? input.actor.id : null,
        quotedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quoteRequests.id, quote.id))
      .returning();
    await recordAudit(tx, {
      actor: input.actor,
      action: "quote.send",
      entityType: "quote",
      entityId: quote.id,
      after: { reference: quote.reference, lines: items.length, expiresAt: expiresAt.toISOString() },
      request: input.request,
    });
    return row;
  });
}

/**
 * The buyer accepts: every quoted line becomes an agreed price on their account, valid for as
 * long as the quote was, and from the quantity that was quoted. An order placed afterwards is
 * priced by `priceCart()` from those rows, so nothing here can be claimed by the browser.
 */
export async function acceptQuote(quoteId: number, user: SessionUser, request?: Request): Promise<QuoteRequest> {
  const quote = await loadQuote(quoteId);
  if (quote.userId !== user.id) throw new QuoteError("That quote belongs to another account.", 403);
  if (!canTransition(quote.status, "accepted")) throw new QuoteError(`This quote is ${quote.status}.`, 409);
  if (quote.expiresAt && quote.expiresAt <= new Date()) throw new QuoteError("This quote has expired. Ask for a new one.", 409);

  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id));
  if (items.some((item) => item.casePrice === null)) throw new QuoteError("This quote is not priced yet.", 409);

  return db.transaction(async (tx) => {
    for (const item of items) {
      const values = {
        userId: quote.userId,
        productId: item.productId,
        casePrice: item.casePrice!,
        // The price was quoted for this quantity, so it starts there.
        minCases: item.cases,
        startsAt: null,
        expiresAt: quote.expiresAt,
        note: `Quote ${quote.reference}`,
        createdBy: quote.quotedBy,
        updatedAt: new Date(),
      };
      await tx
        .insert(accountPrices)
        .values(values)
        .onConflictDoUpdate({ target: [accountPrices.userId, accountPrices.productId], set: values });
    }
    const [row] = await tx
      .update(quoteRequests)
      .set({ status: "accepted", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(quoteRequests.id, quote.id))
      .returning();
    await recordAudit(tx, {
      actor: { id: user.id, email: user.email },
      action: "quote.accept",
      entityType: "quote",
      entityId: quote.id,
      after: { reference: quote.reference, prices: items.length },
      request,
    });
    return row;
  });
}

export async function setQuoteStatus(input: {
  quoteId: number;
  to: QuoteStatus;
  actor: AuditActor;
  user?: SessionUser;
  note?: string | null;
  request?: Request;
}): Promise<QuoteRequest> {
  const quote = await loadQuote(input.quoteId);
  if (input.user && quote.userId !== input.user.id) throw new QuoteError("That quote belongs to another account.", 403);
  if (!canTransition(quote.status, input.to)) {
    throw new QuoteError(`A ${quote.status} request cannot be ${input.to}.`, 409);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(quoteRequests)
      .set({
        status: input.to,
        adminNote: input.note?.trim().slice(0, 1000) || quote.adminNote,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quoteRequests.id, quote.id))
      .returning();
    await recordAudit(tx, {
      actor: input.actor,
      action: `quote.${input.to}`,
      entityType: "quote",
      entityId: quote.id,
      before: { status: quote.status },
      after: { status: input.to, reference: quote.reference },
      request: input.request,
    });
    return row;
  });
}

export async function loadQuote(quoteId: number): Promise<QuoteRequest> {
  const [quote] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, quoteId)).limit(1);
  if (!quote) throw new QuoteError("Quote not found.", 404);
  return quote;
}

/** Quotes with their lines, newest first. Without `userId` it is the whole desk queue. */
export async function listQuotes(userId?: number): Promise<QuoteView[]> {
  const rows = await db
    .select({ quote: quoteRequests, account: users })
    .from(quoteRequests)
    .innerJoin(users, eq(users.id, quoteRequests.userId))
    .where(userId ? eq(quoteRequests.userId, userId) : undefined)
    .orderBy(desc(quoteRequests.createdAt))
    .limit(200);
  if (!rows.length) return [];

  const lines = await db
    .select({ item: quoteItems, sku: products.sku, name: products.name, listCasePrice: products.casePrice })
    .from(quoteItems)
    .innerJoin(products, eq(products.id, quoteItems.productId))
    .where(inArray(quoteItems.quoteId, rows.map((row) => row.quote.id)))
    .orderBy(asc(quoteItems.id));

  return rows.map(({ quote, account }) => ({
    id: quote.id,
    reference: quote.reference,
    status: quote.status,
    customerNote: quote.customerNote,
    adminNote: quote.adminNote,
    expiresAt: quote.expiresAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    account: { id: account.id, email: account.email, name: account.name, company: account.company },
    lines: lines
      .filter((line) => line.item.quoteId === quote.id)
      .map((line) => ({
        id: line.item.id,
        productId: line.item.productId,
        sku: line.sku,
        name: line.name,
        cases: line.item.cases,
        listCasePrice: line.listCasePrice,
        casePrice: line.item.casePrice,
        note: line.item.note,
      })),
  }));
}

/** Daily: quotes whose deadline has passed stop being acceptable. */
export async function expireQuotes(): Promise<string[]> {
  const rows = await db
    .update(quoteRequests)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(quoteRequests.status, "quoted"), lt(quoteRequests.expiresAt, sql`now()`)))
    .returning({ reference: quoteRequests.reference });
  return rows.map((row) => row.reference);
}
