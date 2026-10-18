import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { validateProductInput } from "@/lib/product-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Full edit (`{ full: true, ...fields }`) or a quick toggle of
 * active / featured / stock for the list view.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const id = parseId((await context.params).id);
    if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

    const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!current) return Response.json({ error: "Product not found." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    if (body.full === true) {
      const result = validateProductInput(body);
      if (!result.ok) return Response.json({ error: result.error }, { status: 422 });

      const [clash] = await db
        .select({ name: products.name })
        .from(products)
        .where(and(eq(products.sku, result.values.sku), ne(products.id, id)))
        .limit(1);
      if (clash) {
        return Response.json(
          { error: `SKU ${result.values.sku} is already used by “${clash.name}”.` },
          { status: 409 },
        );
      }

      // The slug stays stable so existing links and search results keep working.
      await db.update(products).set(result.values).where(eq(products.id, id));
      return Response.json({ ok: true, message: `“${result.values.name}” updated.` });
    }

    const patch: Partial<typeof products.$inferInsert> = {};
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (body.stock !== undefined) {
      const stock = Math.round(Number(body.stock));
      if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
        return Response.json({ error: "Stock must be 0 or more cases." }, { status: 400 });
      }
      patch.stock = stock;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No changes supplied." }, { status: 400 });
    }

    await db.update(products).set(patch).where(eq(products.id, id));
    return Response.json({ ok: true, message: "Saved." });
  } catch (error) {
    console.error("[admin-product-update]", error);
    return Response.json({ error: "Could not update the product." }, { status: 500 });
  }
}

/** Permanently removes a product. Past orders keep their line items (name, SKU, price). */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const id = parseId((await context.params).id);
    if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

    const deleted = await db.delete(products).where(eq(products.id, id)).returning({ name: products.name });
    if (!deleted.length) return Response.json({ error: "Product not found." }, { status: 404 });
    return Response.json({ ok: true, message: `“${deleted[0].name}” deleted.` });
  } catch (error) {
    console.error("[admin-product-delete]", error);
    return Response.json({ error: "Could not delete the product." }, { status: 500 });
  }
}
