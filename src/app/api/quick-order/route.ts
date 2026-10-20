import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { canSeePrices, getSessionUser, PRICE_LOCKED_MESSAGE } from "@/lib/auth";
import { resolveCasePrice } from "@/lib/checkout";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { ozToLbs } from "@/lib/weight";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const user = await getSessionUser();
    if (!canSeePrices(user)) return Response.json({ error: PRICE_LOCKED_MESSAGE }, { status: 403 });
    const limit = await consumeRateLimit("quick-order", clientIp(request), 120, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as { rows?: { sku?: string; cases?: number | string }[]; raw?: string };
    const parsed: { sku: string; cases: number }[] = [];

    if (Array.isArray(body.rows) && body.rows.length) {
      for (const row of body.rows) {
        const sku = String(row.sku ?? "").trim().toUpperCase();
        const cases = Math.max(1, Math.round(Number(row.cases ?? 0)));
        if (sku) parsed.push({ sku, cases });
      }
    } else if (body.raw) {
      for (const line of body.raw.split(/\n+/)) {
        const match = line.trim().match(/^([A-Za-z0-9-]+)[\s,;xX]+(\d+)$/);
        if (match) parsed.push({ sku: match[1].toUpperCase(), cases: Math.max(1, Number(match[2])) });
      }
    }

    if (!parsed.length) {
      return Response.json(
        { error: "Add at least one line in the format SKU<space>cases (e.g. MSC-VIT-090 3)." },
        { status: 400 },
      );
    }

    const skus = Array.from(new Set(parsed.map((row) => row.sku)));
    // A pasted code may be our SKU or the unit / case barcode (UPC, EAN, ITF-14).
    const barcodes = skus.map((sku) => sku.replace(/[\s-]/g, "")).filter((code) => /^\d{8,14}$/.test(code));
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.active, true),
          barcodes.length
            ? or(inArray(products.sku, skus), inArray(products.gtin, barcodes), inArray(products.caseGtin, barcodes))
            : inArray(products.sku, skus),
        ),
      );
    const bySku = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      bySku.set(row.sku.toUpperCase(), row);
      if (row.gtin) bySku.set(row.gtin, row);
      if (row.caseGtin) bySku.set(row.caseGtin, row);
    }

    const lines = parsed.map((row) => {
      const product = bySku.get(row.sku) ?? bySku.get(row.sku.replace(/[\s-]/g, ""));
      if (!product) return { sku: row.sku, cases: row.cases, found: false as const };
      return {
        sku: row.sku,
        cases: row.cases,
        found: true as const,
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          sku: product.sku,
          image: product.image,
          casePrice: product.casePrice,
          caseSize: product.caseSize,
          msrpUnit: product.msrpUnit,
          minCases: product.minCases,
          category: product.category,
          weightLbs: ozToLbs(product.weightOz),
          stock: product.stock,
          priceTiers: product.priceTiers,
        },
        lineTotal: resolveCasePrice(product, row.cases) * row.cases,
      };
    });

    return Response.json({
      ok: true,
      lines,
      missing: lines.filter((line) => !line.found).map((line) => line.sku),
      subtotal: lines.reduce((sum, line) => sum + (line.found ? line.lineTotal : 0), 0),
    });
  } catch (error) {
    console.error("[quick-order]", error);
    return Response.json({ error: "Could not resolve those SKUs." }, { status: 500 });
  }
}
