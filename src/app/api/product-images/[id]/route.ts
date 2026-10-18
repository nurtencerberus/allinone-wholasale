import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";

export const runtime = "nodejs";

/** Public photo endpoint. Ids are never reused, so responses are cached for a year. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select({ mime: productImages.mime, content: productImages.content })
    .from(productImages)
    .where(eq(productImages.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(Buffer.from(row.content)), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
