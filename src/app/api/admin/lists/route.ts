import { db } from "@/db";
import { wholesaleLists } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { LIST_CATEGORIES, MAX_LIST_BYTES, parseListFile } from "@/lib/wholesale-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload a supplier list (.xlsx / .xls / .csv) and publish it on the homepage. */
export async function POST(request: Request) {
  try {
    const admin = await requireStaff("lists");
    if (!admin) return staffDenied();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Attach an .xlsx, .xls or .csv file." }, { status: 400 });
    }
    if (file.size > MAX_LIST_BYTES) {
      return Response.json({ error: "Files are limited to 4 MB." }, { status: 400 });
    }

    const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
    const supplier = String(form.get("supplier") ?? "").trim();
    if (supplier.length < 2) {
      return Response.json({ error: "Enter the supplier or wholesaler name." }, { status: 400 });
    }

    const category = String(form.get("category") ?? "mixed");
    const audience = String(form.get("audience") ?? "public");
    if (!(LIST_CATEGORIES as readonly string[]).includes(category)) {
      return Response.json({ error: "Unknown department." }, { status: 400 });
    }
    if (!["public", "trade"].includes(audience)) {
      return Response.json({ error: "Audience must be public or trade." }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await parseListFile(data, file.name);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not read that file." },
        { status: 422 },
      );
    }

    const [created] = await db
      .insert(wholesaleLists)
      .values({
        title,
        supplier,
        description: String(form.get("description") ?? "").trim(),
        category,
        audience,
        filename: file.name,
        format: parsed.format,
        bytes: data.length,
        rowCount: parsed.rowCount,
        columns: parsed.columns,
        preview: parsed.preview,
        content: data,
        published: form.get("published") !== "false",
      })
      .returning({ id: wholesaleLists.id, title: wholesaleLists.title });
    await recordAudit(db, {
      actor: admin,
      action: "list.upload",
      entityType: "list",
      entityId: created?.id,
      after: { title, supplier, filename: file.name, rows: parsed.rowCount },
      request,
    });

    return Response.json({
      ok: true,
      id: created?.id,
      message: `“${title}” published — ${parsed.rowCount} rows, ${parsed.columns.length} columns.`,
      rowCount: parsed.rowCount,
      columns: parsed.columns,
    });
  } catch (error) {
    console.error("[admin-lists-upload]", error);
    return Response.json({ error: "Could not save the list." }, { status: 500 });
  }
}
