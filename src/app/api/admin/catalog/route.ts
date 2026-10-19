import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productConflictMessage } from "@/db/errors";
import { products } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { normalizeCatalogPayload, serializeCatalog } from "@/lib/catalog-import";
import { InventoryError, receiveLot } from "@/lib/inventory";
import { parseOpeningStock, slugifyName, validateProductInput, type OpeningStock, type ProductValues } from "@/lib/product-input";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full catalog dump — hand this to another storefront or edit it and import it back. */
export async function GET() {
  try {
    const admin = await requireStaff("products");
    if (!admin) return staffDenied();
    await ensureSeeded();

    const rows = await db.select().from(products);
    const body = JSON.stringify(serializeCatalog(rows), null, 2);

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ciputra-catalog-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[catalog-export]", error);
    return Response.json({ error: "Could not export the catalog." }, { status: 500 });
  }
}

type Planned = { sku: string; values: ProductValues; existingId: number | null; slug: string | null; opening: OpeningStock };

/**
 * Upsert products by SKU. Every row passes the same validation as the admin form; if any row
 * fails, nothing is written and every problem is reported with its row number. Existing
 * products keep their slug (links) and their stock (lots); new products may bring opening stock.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireStaff("products");
    if (!admin) return staffDenied();
    await ensureSeeded();

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
    }

    const { rows, errors, warnings } = normalizeCatalogPayload(payload);
    const existing = rows.length
      ? await db
          .select({ id: products.id, sku: products.sku, slug: products.slug })
          .from(products)
          .where(inArray(products.sku, rows.map((row) => row.sku)))
      : [];
    const existingBySku = new Map(existing.map((row) => [row.sku, row]));

    const planned: Planned[] = [];
    for (const row of rows) {
      const result = validateProductInput(row.input);
      if (!result.ok) {
        errors.push(`Row ${row.row} (${row.sku}): ${result.error}`);
        continue;
      }
      const current = existingBySku.get(row.sku);
      let opening: OpeningStock = null;
      if (!current) {
        const parsed = parseOpeningStock(row.input, result.values);
        if (!parsed.ok) {
          errors.push(`Row ${row.row} (${row.sku}): ${parsed.error}`);
          continue;
        }
        opening = parsed.opening;
      } else if (row.input.openingStock !== undefined) {
        warnings.push(`${row.sku}: stock in the file was ignored — receive or adjust lots on the Inventory screen.`);
      }
      planned.push({ sku: row.sku, values: result.values, existingId: current?.id ?? null, slug: row.slug, opening });
    }

    if (errors.length || !planned.length) {
      return Response.json(
        { error: errors[0] ?? "No products to import.", errors, warnings, written: false },
        { status: 422 },
      );
    }

    const taken = new Set((await db.select({ slug: products.slug }).from(products)).map((row) => row.slug));
    const pickSlug = (wanted: string) => {
      let slug = wanted;
      for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${wanted}-${suffix}`;
      taken.add(slug);
      return slug;
    };

    const created: string[] = [];
    const updated: string[] = [];
    try {
      await db.transaction(async (tx) => {
        for (const entry of planned) {
          if (entry.existingId) {
            await tx.update(products).set({ ...entry.values, updatedAt: new Date() }).where(eq(products.id, entry.existingId));
            updated.push(entry.sku);
            continue;
          }
          const [row] = await tx
            .insert(products)
            .values({ ...entry.values, slug: pickSlug(entry.slug ?? slugifyName(entry.values.name)), stock: 0, ratingX10: 0, reviewCount: 0 })
            .returning({ id: products.id });
          if (entry.opening) {
            await receiveLot(tx, {
              productId: row.id,
              lotNumber: entry.opening.lotNumber,
              expiresOn: entry.opening.expiresOn,
              cases: entry.opening.cases,
              reason: "import",
              refType: "import",
              actorId: admin.id,
            });
          }
          created.push(entry.sku);
        }
        await recordAudit(tx, {
          actor: admin,
          action: "catalog.import",
          entityType: "catalog",
          after: { created: created.length, updated: updated.length, skus: [...created, ...updated].slice(0, 50) },
          request,
        });
      });
    } catch (error) {
      if (error instanceof InventoryError) return Response.json({ error: error.message, errors: [error.message], warnings, written: false }, { status: 422 });
      const conflict = productConflictMessage(error, { sku: "in this file", gtin: "in this file" });
      if (conflict) return Response.json({ error: conflict, errors: [conflict], warnings, written: false }, { status: 409 });
      throw error;
    }

    return Response.json({ ok: true, written: true, created, updated, failed: [], errors: [], warnings });
  } catch (error) {
    console.error("[catalog-import]", error);
    return Response.json({ error: "Could not import the catalog." }, { status: 500 });
  }
}
