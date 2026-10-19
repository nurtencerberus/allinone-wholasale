import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { CATEGORIES, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.domain.replace(/\/$/, "");
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${base}/wholesale`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/wholesale/apply`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    ...["terms", "shipping", "returns", "privacy", "accessibility"].map((page) => ({
      url: `${base}/legal/${page}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: `${base}/shop?category=${category.key}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    await ensureSeeded();
    const rows = await db
      .select({
        slug: products.slug,
        updatedAt: products.createdAt,
        image: products.image,
        name: products.name,
      })
      .from(products)
      .where(eq(products.active, true));

    productRoutes = rows.map((row) => ({
      url: `${base}/products/${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: "weekly",
      priority: 0.9,
      images: [row.image.startsWith("http") ? row.image : `${base}${row.image}`],
    }));
  } catch (error) {
    console.error("[sitemap] product routes unavailable", error);
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
