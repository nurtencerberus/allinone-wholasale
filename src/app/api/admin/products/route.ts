import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { slugifyName, validateProductInput } from "@/lib/product-input";

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

/** Create a new product. Money fields are integer cents. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
    }

    const result = validateProductInput(body);
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    const values = result.values;

    const [existing] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.sku, values.sku))
      .limit(1);
    if (existing) {
      return Response.json(
        { error: `SKU ${values.sku} is already used by “${existing.name}”. Choose a different SKU.` },
        { status: 409 },
      );
    }

    const slug = await uniqueSlug(values.name);
    const [created] = await db
      .insert(products)
      .values({ ...values, slug, ratingX10: 0, reviewCount: 0 })
      .returning({ id: products.id, slug: products.slug, sku: products.sku, name: products.name });

    if (!created) return Response.json({ error: "Could not create the product." }, { status: 500 });

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
