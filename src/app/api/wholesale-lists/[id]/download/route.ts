import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { wholesaleLists } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  canAccessTrade,
  listSlug,
  renderListFile,
  type ListFormat,
} from "@/lib/wholesale-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const listId = Number(id);
    if (!Number.isFinite(listId)) return Response.json({ error: "Invalid list id." }, { status: 400 });

    const [row] = await db.select().from(wholesaleLists).where(eq(wholesaleLists.id, listId)).limit(1);
    const user = await getSessionUser();
    const isAdmin = user?.role === "admin";

    if (!row || (!row.published && !isAdmin)) {
      return Response.json({ error: "List not found." }, { status: 404 });
    }
    if (row.audience === "trade" && !canAccessTrade(user)) {
      return Response.json(
        { error: "This list is available to approved trade accounts. Sign in or apply for wholesale." },
        { status: 403 },
      );
    }

    const requested = new URL(request.url).searchParams.get("format") ?? "original";
    const target = requested === "xlsx" || requested === "csv" ? requested : "original";
    const file = await renderListFile(Buffer.from(row.content), row.format as ListFormat, target);

    await db
      .update(wholesaleLists)
      .set({ downloads: sql`${wholesaleLists.downloads} + 1` })
      .where(eq(wholesaleLists.id, row.id));

    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `attachment; filename="${listSlug(row.title)}.${file.ext}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[wholesale-list-download]", error);
    return Response.json({ error: "Could not prepare that file." }, { status: 500 });
  }
}
