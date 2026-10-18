import { db } from "@/db";
import { productImages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { sniffImage } from "@/lib/product-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Functions reject request bodies over 4.5 MB, so stay safely under it.
const MAX_BYTES = 4 * 1024 * 1024;

/** Upload one product photo; returns the URL to store on the product. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Attach a JPG, PNG, WebP or GIF photo." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Photos are limited to 4 MB each." }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) {
      return Response.json(
        { error: `“${file.name}” is not a JPG, PNG, WebP or GIF image.` },
        { status: 422 },
      );
    }

    const [row] = await db
      .insert(productImages)
      .values({ filename: file.name.slice(0, 120), mime: kind.mime, bytes: data.length, content: data })
      .returning({ id: productImages.id });

    if (!row) return Response.json({ error: "Could not store the photo." }, { status: 500 });
    return Response.json({ ok: true, url: `/api/product-images/${row.id}`, bytes: data.length });
  } catch (error) {
    console.error("[admin-product-image]", error);
    return Response.json({ error: "Could not upload the photo." }, { status: 500 });
  }
}
