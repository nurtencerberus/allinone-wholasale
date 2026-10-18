import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { buildOrderSheetCsv, buildOrderSheetXlsx, type OrderSheetProduct } from "@/lib/order-sheet";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
    const category = url.searchParams.get("category");
    const wholesale = url.searchParams.get("wholesale") === "1";

    const filters = [eq(products.active, true)];
    if (category && ["supplements", "pantry", "home"].includes(category)) {
      filters.push(eq(products.category, category));
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...filters))
      .orderBy(asc(products.category), asc(products.name));

    const sheetProducts: OrderSheetProduct[] = rows.map((product) => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      origin: product.origin,
      caseSize: product.caseSize,
      casePrice: product.casePrice,
      priceTiers: product.priceTiers ?? [],
      msrpUnit: product.msrpUnit,
      stock: product.stock,
      weightLbs: product.weightLbs,
      dimensions: product.dimensions,
      leadTimeDays: product.leadTimeDays,
      slug: product.slug,
    }));

    const scope = category && ["supplements", "pantry", "home"].includes(category) ? `-${category}` : "";
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = wholesale ? "meridian-trade-order-sheet" : `meridian-order-sheet${scope}`;

    if (format === "csv") {
      const csv = buildOrderSheetCsv(sheetProducts);
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseName}-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await buildOrderSheetXlsx(sheetProducts);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[order-sheet-download]", error);
    return Response.json({ error: "Could not generate the order sheet." }, { status: 500 });
  }
}
