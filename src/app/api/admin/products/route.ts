import { like } from "drizzle-orm";
import { db } from "@/db";
import { productConflictMessage } from "@/db/errors";
import { products } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { InventoryError, receiveLot } from "@/lib/inventory";
import { parseOpeningStock, slugifyName, validateProductInput } from "@/lib/product-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyName(name);
  const taken = await db
    .select({ slug: products.slug })
    .from(products)
    .where(like(products.slug, `${base}%`));
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Create a new product. Money fields are integer cents; opening stock becomes its first lot. */
export async function POST(request: Request) {
  try {
    const admin = await requireStaff("products");
    if (!admin) return staffDenied();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
    }

    const result = validateProductInput(body);
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    const values = result.values;
    const opening = parseOpeningStock(body, values);
    if (!opening.ok) return Response.json({ error: opening.error }, { status: 422 });

    const slug = await uniqueSlug(values.name);
    let created;
    try {
      created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({ ...values, slug, stock: 0, ratingX10: 0, reviewCount: 0 })
          .returning({ id: products.id, slug: products.slug, sku: products.sku, name: products.name });
        if (opening.opening) {
          await receiveLot(tx, {
            productId: row.id,
            lotNumber: opening.opening.lotNumber,
            expiresOn: opening.opening.expiresOn,
            cases: opening.opening.cases,
            reason: "opening",
            actorId: admin.id,
          });
        }
        await recordAudit(tx, {
          actor: admin,
          action: "product.create",
          entityType: "product",
          entityId: row.id,
          after: { sku: values.sku, name: values.name, casePrice: values.casePrice, openingStock: opening.opening?.cases ?? 0 },
          request,
        });
        return row;
      });
    } catch (error) {
      if (error instanceof InventoryError) return Response.json({ error: error.message }, { status: 422 });
      const conflict = productConflictMessage(error, values);
      if (conflict) return Response.json({ error: conflict }, { status: 409 });
      throw error;
    }

    return Response.json({
      ok: true,
      product: created,
      message: values.active
        ? `“${created.name}” is live in the store.`
        : `“${created.name}” saved as archived — publish it when you are ready.`,
    });
  } catch (error) {
    console.error("[admin-product-create]", error);
    return Response.json({ error: "Could not create the product." }, { status: 500 });
  }
}
