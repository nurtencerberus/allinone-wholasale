import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { productConflictMessage } from "@/db/errors";
import { inventoryMovements, productImages, products } from "@/db/schema";
import { revalidateCatalog } from "@/lib/catalog-cache";
import { requireStaff, staffDenied } from "@/lib/auth";
import { diffFields, recordAudit } from "@/lib/audit";
import { validateProductInput } from "@/lib/product-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Full edit (`{ full: true, updatedAt, ...fields }`) or a quick toggle of active / featured
 * for the list view. Stock is never written here — it changes only through lots
 * (/api/admin/inventory), so an edit cannot overwrite orders placed meanwhile.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("products");
    if (!admin) return staffDenied();

    const id = parseId((await context.params).id);
    if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

    const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!current) return Response.json({ error: "Product not found." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    if (body.stock !== undefined && body.full !== true) {
      return Response.json({ error: "Stock changes go through Inventory (receive or adjust a lot)." }, { status: 400 });
    }

    if (body.full === true) {
      const result = validateProductInput(body);
      if (!result.ok) return Response.json({ error: result.error }, { status: 422 });

      // Optimistic lock: the form sends back the version it loaded.
      const expected = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
      if (!expected || Number.isNaN(expected.getTime())) {
        return Response.json({ error: "Reload the product before saving (missing version)." }, { status: 409 });
      }

      const [clash] = await db
        .select({ name: products.name })
        .from(products)
        .where(and(eq(products.sku, result.values.sku), ne(products.id, id)))
        .limit(1);
      if (clash) {
        return Response.json({ error: `SKU ${result.values.sku} is already used by “${clash.name}”.` }, { status: 409 });
      }

      try {
        const saved = await db.transaction(async (tx) => {
          // The slug stays stable so existing links and search results keep working.
          const [row] = await tx
            .update(products)
            .set({ ...result.values, updatedAt: new Date() })
            // JS dates carry milliseconds, Postgres microseconds: match within one millisecond.
            .where(
              and(
                eq(products.id, id),
                sql`abs(extract(epoch from ${products.updatedAt} - ${expected.toISOString()}::timestamptz)) < 0.001`,
              ),
            )
            .returning({ updatedAt: products.updatedAt });
          if (!row) return null;
          const diff = diffFields(current as unknown as Record<string, unknown>, result.values as unknown as Record<string, unknown>);
          if (Object.keys(diff.after).length) {
            await recordAudit(tx, { actor: admin, action: "product.update", entityType: "product", entityId: id, ...diff, request });
          }
          return row;
        });
        if (!saved) {
          return Response.json(
            { error: "Someone else saved this product after you opened it. Reload to see their changes, then edit again." },
            { status: 409 },
          );
        }
        revalidateCatalog();
        return Response.json({ ok: true, updatedAt: saved.updatedAt.toISOString(), message: `“${result.values.name}” updated.` });
      } catch (error) {
        const conflict = productConflictMessage(error, result.values);
        if (conflict) return Response.json({ error: conflict }, { status: 409 });
        throw error;
      }
    }

    const patch: Partial<typeof products.$inferInsert> = {};
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No changes supplied." }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.update(products).set({ ...patch, updatedAt: new Date() }).where(eq(products.id, id));
      const diff = diffFields(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
      await recordAudit(tx, { actor: admin, action: "product.toggle", entityType: "product", entityId: id, ...diff, request });
    });
    revalidateCatalog();
    return Response.json({ ok: true, message: "Saved." });
  } catch (error) {
    console.error("[admin-product-update]", error);
    return Response.json({ error: "Could not update the product." }, { status: 500 });
  }
}

const UPLOADED_IMAGE = /^\/api\/product-images\/(\d+)$/;

/**
 * Permanently removes a product that never held stock. Products with a stock history are
 * archived instead, so the ledger and recall trail survive. Uploaded photos used only by the
 * deleted product are removed with it.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("products");
    if (!admin) return staffDenied();

    const id = parseId((await context.params).id);
    if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

    const [history] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, id));
    if (history && history.count > 0) {
      return Response.json(
        { error: "This product has stock history (lots or orders). Archive it instead so the ledger and recall trail are kept." },
        { status: 409 },
      );
    }

    const result = await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(products).where(eq(products.id, id)).returning();
      if (!deleted) return null;
      const urls = [deleted.image, ...deleted.images, deleted.factsPanelImage ?? "", ...deleted.certifications.map((cert) => cert.documentUrl ?? "")];
      const imageIds = [...new Set(urls.map((url) => UPLOADED_IMAGE.exec(url)?.[1]).filter(Boolean).map(Number))];
      let removedImages = 0;
      if (imageIds.length) {
        const others = await tx
          .select({ image: products.image, images: products.images, facts: products.factsPanelImage, certifications: products.certifications })
          .from(products);
        // Certificate documents count as uses too, or deleting one product breaks another's proof.
        const stillUsed = new Set(
          others
            .flatMap((row) => [row.image, ...row.images, row.facts ?? "", ...row.certifications.map((cert) => cert.documentUrl ?? "")])
            .map((url) => UPLOADED_IMAGE.exec(url)?.[1])
            .filter(Boolean)
            .map(Number),
        );
        const orphaned = imageIds.filter((imageId) => !stillUsed.has(imageId));
        if (orphaned.length) {
          removedImages = (await tx.delete(productImages).where(inArray(productImages.id, orphaned)).returning({ id: productImages.id })).length;
        }
      }
      await recordAudit(tx, {
        actor: admin,
        action: "product.delete",
        entityType: "product",
        entityId: id,
        before: { sku: deleted.sku, name: deleted.name },
        after: { removedImages },
        request,
      });
      return deleted;
    });
    if (!result) return Response.json({ error: "Product not found." }, { status: 404 });
    revalidateCatalog();
    return Response.json({ ok: true, message: `“${result.name}” deleted.` });
  } catch (error) {
    console.error("[admin-product-delete]", error);
    return Response.json({ error: "Could not delete the product." }, { status: 500 });
  }
}
