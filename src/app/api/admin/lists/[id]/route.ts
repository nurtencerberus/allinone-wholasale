import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wholesaleLists } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { LIST_CATEGORIES } from "@/lib/wholesale-lists";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const { id } = await context.params;
    const listId = Number(id);
    if (!Number.isFinite(listId)) return Response.json({ error: "Invalid list id." }, { status: 400 });

    const body = (await request.json()) as {
      title?: string;
      supplier?: string;
      description?: string;
      category?: string;
      audience?: string;
      published?: boolean;
    };

    const patch: Partial<typeof wholesaleLists.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      if (!body.title.trim()) return Response.json({ error: "Title cannot be empty." }, { status: 400 });
      patch.title = body.title.trim();
    }
    if (body.supplier !== undefined) {
      if (body.supplier.trim().length < 2) {
        return Response.json({ error: "Supplier name is too short." }, { status: 400 });
      }
      patch.supplier = body.supplier.trim();
    }
    if (body.description !== undefined) patch.description = body.description.trim();
    if (body.category !== undefined) {
      if (!(LIST_CATEGORIES as readonly string[]).includes(body.category)) {
        return Response.json({ error: "Unknown department." }, { status: 400 });
      }
      patch.category = body.category;
    }
    if (body.audience !== undefined) {
      if (!["public", "trade"].includes(body.audience)) {
        return Response.json({ error: "Audience must be public or trade." }, { status: 400 });
      }
      patch.audience = body.audience;
    }
    if (body.published !== undefined) patch.published = Boolean(body.published);

    const [updated] = await db
      .update(wholesaleLists)
      .set(patch)
      .where(eq(wholesaleLists.id, listId))
      .returning({ id: wholesaleLists.id, published: wholesaleLists.published, audience: wholesaleLists.audience });

    if (!updated) return Response.json({ error: "List not found." }, { status: 404 });
    return Response.json({ ok: true, list: updated });
  } catch (error) {
    console.error("[admin-lists-patch]", error);
    return Response.json({ error: "Could not update the list." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const { id } = await context.params;
    const listId = Number(id);
    if (!Number.isFinite(listId)) return Response.json({ error: "Invalid list id." }, { status: 400 });

    await db.delete(wholesaleLists).where(eq(wholesaleLists.id, listId));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[admin-lists-delete]", error);
    return Response.json({ error: "Could not delete the list." }, { status: 500 });
  }
}
