import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  catalogSummary,
  normalizeCatalogPayload,
  serializeCatalog,
  type NormalizedProduct,
} from "@/lib/catalog-import";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full catalog dump — hand this to another storefront or edit it and import it back. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });
    await ensureSeeded();

    const rows = await db.select().from(products);
    const body = JSON.stringify(serializeCatalog(rows), null, 2);

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="meridian-catalog-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[catalog-export]", error);
    return Response.json({ error: "Could not export the catalog." }, { status: 500 });
  }
}

/** Upsert products by SKU — used to merge another project's product data. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });
    await ensureSeeded();

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
    }

    const { products: normalized, errors, warnings } = normalizeCatalogPayload(payload);
    if (!normalized.length) {
      return Response.json(
        { error: errors[0] ?? "No products to import.", errors, warnings },
        { status: 422 },
      );
    }

    const created: string[] = [];
    const updated: string[] = [];
    const failed: { sku: string; reason: string }[] = [];

    for (const entry of normalized) {
      const values = toDbValues(entry);
      try {
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, entry.sku))
          .limit(1);

        if (existing) {
          await db.update(products).set(values).where(eq(products.id, existing.id));
          updated.push(entry.sku);
        } else {
          await db.insert(products).values(values);
          created.push(entry.sku);
        }
      } catch (error) {
        failed.push({
          sku: entry.sku,
          reason:
            error instanceof Error && /slug/i.test(error.message)
              ? "slug already used by another product"
              : "database rejected the row (check required fields)",
        });
      }
    }

    return Response.json({
      ok: true,
      created,
      updated,
      failed,
      errors,
      warnings,
      summary: catalogSummary(normalized),
    });
  } catch (error) {
    console.error("[catalog-import]", error);
    return Response.json({ error: "Could not import the catalog." }, { status: 500 });
  }
}

function toDbValues(entry: NormalizedProduct) {
  return {
    sku: entry.sku,
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    tagline: entry.tagline,
    description: entry.description,
    story: entry.story,
    brand: entry.brand,
    origin: entry.origin,
    msrpUnit: entry.msrpUnit,
    casePrice: entry.casePrice,
    caseSize: entry.caseSize,
    minCases: entry.minCases,
    priceTiers: entry.priceTiers,
    weightLbs: entry.weightLbs,
    dimensions: entry.dimensions,
    stock: entry.stock,
    leadTimeDays: entry.leadTimeDays,
    ratingX10: entry.ratingX10,
    reviewCount: entry.reviewCount,
    image: entry.image,
    images: entry.images,
    features: entry.features,
    specs: entry.specs,
    badges: entry.badges,
    featured: entry.featured,
    active: entry.active,
  };
}
