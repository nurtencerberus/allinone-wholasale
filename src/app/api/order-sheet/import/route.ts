import { formatOrderSheetSummary, parseOrderSheet } from "@/lib/order-sheet";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Functions reject request bodies over 4.5 MB, so stay safely under it.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const limit = await consumeRateLimit("sheet-import", clientIp(request), 30, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Attach an .xlsx, .xls or .csv file." }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "The attached file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Files are limited to 4 MB." }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const parsed = await parseOrderSheet(data, file.name || "order-sheet.xlsx");

    if (!parsed.rows.length) {
      const specific = parsed.warnings.find(
        (warning) =>
          warning.startsWith("The quantity column") || warning.startsWith("Could not find a SKU column"),
      );
      return Response.json(
        {
          error:
            specific ??
            "No order lines found. Make sure the sheet has a SKU column and a quantity column.",
          warnings: parsed.warnings,
        },
        { status: 422 },
      );
    }

    return Response.json({
      ok: true,
      filename: file.name,
      summary: formatOrderSheetSummary(parsed),
      skuColumn: parsed.skuColumn,
      quantityColumn: parsed.quantityColumn,
      warnings: parsed.warnings,
      rows: parsed.rows,
    });
  } catch (error) {
    console.error("[order-sheet-import]", error);
    return Response.json(
      { error: "Could not read that file. Export it as .xlsx or .csv and try again." },
      { status: 500 },
    );
  }
}
