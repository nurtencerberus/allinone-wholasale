import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountPrices, products, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireStaff, staffDenied } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UX-7: the negotiated price list of one trade account. Sits behind the "accounts" permission
 * (owner and sales), like every other commercial term, and every change is audit-logged.
 *
 * A price here replaces the catalogue and tier price for that buyer and is not discounted again
 * by the account's percentage — `priceCart()` enforces that, this endpoint only records it.
 */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDate(raw: unknown, field: string): Date | null | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = new Date(text);
  return Number.isNaN(value.getTime()) ? { error: `${field} is not a valid date.` } : value;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const userId = parseId((await context.params).id);
    if (!userId) return Response.json({ error: "Unknown account." }, { status: 400 });

    const [account] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Choose a product." }, { status: 400 });

    const [product] = await db
      .select({ id: products.id, sku: products.sku, name: products.name, casePrice: products.casePrice, minCases: products.minCases })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    // Prices arrive in dollars from the form and are stored in cents, like everything else.
    const dollars = Number(body.casePrice);
    if (!Number.isFinite(dollars) || dollars <= 0) return Response.json({ error: "Enter the agreed case price." }, { status: 400 });
    const casePrice = Math.round(dollars * 100);

    const minCasesRaw = body.minCases;
    const minCases =
      minCasesRaw === null || minCasesRaw === undefined || String(minCasesRaw).trim() === "" ? null : Number(minCasesRaw);
    if (minCases !== null && (!Number.isInteger(minCases) || minCases < 1)) {
      return Response.json({ error: "Minimum cases must be a whole number of 1 or more." }, { status: 400 });
    }

    const startsAt = parseDate(body.startsAt, "Start date");
    if (startsAt && "error" in startsAt) return Response.json({ error: startsAt.error }, { status: 400 });
    const expiresAt = parseDate(body.expiresAt, "End date");
    if (expiresAt && "error" in expiresAt) return Response.json({ error: expiresAt.error }, { status: 400 });
    if (startsAt && expiresAt && expiresAt <= startsAt) {
      return Response.json({ error: "The end date must be after the start date." }, { status: 400 });
    }

    const values = {
      userId,
      productId,
      casePrice,
      minCases,
      startsAt: startsAt as Date | null,
      expiresAt: expiresAt as Date | null,
      note: String(body.note ?? "").trim().slice(0, 300) || null,
      createdBy: admin.id,
      updatedAt: new Date(),
    };

    const saved = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(accountPrices)
        .where(and(eq(accountPrices.userId, userId), eq(accountPrices.productId, productId)))
        .limit(1);
      const [row] = await tx
        .insert(accountPrices)
        .values(values)
        .onConflictDoUpdate({ target: [accountPrices.userId, accountPrices.productId], set: values })
        .returning();
      await recordAudit(tx, {
        actor: admin,
        action: before ? "account-price.update" : "account-price.create",
        entityType: "account-price",
        entityId: row.id,
        before: before ? { casePrice: before.casePrice, minCases: before.minCases } : null,
        after: { account: account.email, sku: product.sku, casePrice, minCases },
        request,
      });
      return row;
    });

    return Response.json({
      ok: true,
      price: saved,
      message: `${product.sku}: agreed price saved for ${account.email}.`,
    });
  } catch (error) {
    console.error("[admin-account-price-save]", error);
    return Response.json({ error: "Could not save the price." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const userId = parseId((await context.params).id);
    const productId = Number(new URL(request.url).searchParams.get("productId"));
    if (!userId || !Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: "Unknown account or product." }, { status: 400 });
    }

    const removed = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(accountPrices)
        .where(and(eq(accountPrices.userId, userId), eq(accountPrices.productId, productId)))
        .returning();
      if (!row) return null;
      await recordAudit(tx, {
        actor: admin,
        action: "account-price.delete",
        entityType: "account-price",
        entityId: row.id,
        before: { casePrice: row.casePrice, minCases: row.minCases },
        request,
      });
      return row;
    });

    if (!removed) return Response.json({ error: "That price is already gone." }, { status: 404 });
    return Response.json({ ok: true, message: "Agreed price removed; the account falls back to list pricing." });
  } catch (error) {
    console.error("[admin-account-price-delete]", error);
    return Response.json({ error: "Could not remove the price." }, { status: 500 });
  }
}
