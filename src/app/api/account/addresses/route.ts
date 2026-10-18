import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const rows = await db.select().from(addresses).where(eq(addresses.userId, user.id));
  return Response.json({ ok: true, addresses: rows });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

    const body = (await request.json()) as Record<string, string | boolean>;
    const required = ["label", "name", "line1", "city", "state", "zip"];
    for (const field of required) {
      if (!String(body[field] ?? "").trim()) {
        return Response.json({ error: `Missing field: ${field}` }, { status: 400 });
      }
    }
    const zip = String(body.zip).trim();
    if (!/^\d{5}$/.test(zip)) {
      return Response.json({ error: "ZIP must be 5 digits." }, { status: 400 });
    }

    if (body.isDefault) {
      await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
    }

    const [created] = await db
      .insert(addresses)
      .values({
        userId: user.id,
        label: String(body.label).trim(),
        name: String(body.name).trim(),
        company: String(body.company ?? "").trim() || null,
        line1: String(body.line1).trim(),
        line2: String(body.line2 ?? "").trim() || null,
        city: String(body.city).trim(),
        state: String(body.state).trim().toUpperCase().slice(0, 2),
        zip,
        phone: String(body.phone ?? "").trim() || null,
        isDefault: Boolean(body.isDefault),
      })
      .returning();

    return Response.json({ ok: true, address: created });
  } catch (error) {
    console.error("[addresses-post]", error);
    return Response.json({ error: "Could not save the address." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isFinite(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
    await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[addresses-delete]", error);
    return Response.json({ error: "Could not remove the address." }, { status: 500 });
  }
}
