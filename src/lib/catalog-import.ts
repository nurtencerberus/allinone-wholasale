import type { Product } from "@/db/schema";
import { defaultTaxClass, isTaxClass } from "@/lib/tax";

export const CATALOG_CATEGORIES = ["supplements", "pantry", "home"] as const;

export type NormalizedProduct = {
  sku: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  story: string;
  brand: string;
  origin: string;
  msrpUnit: number;
  casePrice: number;
  caseSize: number;
  minCases: number;
  priceTiers: { minCases: number; casePrice: number }[];
  weightLbs: number;
  dimensions: { l: number; w: number; h: number };
  stock: number;
  leadTimeDays: number;
  ratingX10: number;
  reviewCount: number;
  image: string;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  badges: string[];
  featured: boolean;
  active: boolean;
  taxClass: string;
};

export type CatalogExport = {
  exportedAt: string;
  generator: string;
  currency: "cents";
  count: number;
  products: (Product & { currency?: string })[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toInt(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[|;,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function guessCategory(value: unknown): string | null {
  const text = String(value ?? "").toLowerCase();
  if (CATALOG_CATEGORIES.includes(text as (typeof CATALOG_CATEGORIES)[number])) return text;
  if (/suppl|vitamin|wellness|gummy|capsule/.test(text)) return "supplements";
  if (/pantry|food|grocery|staple|coffee|oil|honey|pasta/.test(text)) return "pantry";
  if (/home|decor|living|candle|vase|textile|furniture/.test(text)) return "home";
  return null;
}

/**
 * Accepts either `{ products: [...] }` or a bare array, in cents (default) or
 * dollars (`currency: "usd"`). Tolerant of the field names another storefront
 * export typically uses: title/name, price/casePrice, qty/caseSize, weight…
 */
export function normalizeCatalogPayload(payload: unknown): {
  products: NormalizedProduct[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const products: NormalizedProduct[] = [];

  const root = (payload ?? {}) as Record<string, unknown>;
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(root.products)
      ? (root.products as unknown[])
      : Array.isArray(root.items)
        ? (root.items as unknown[])
        : null;

  if (!rawList) {
    return {
      products: [],
      errors: ["Expected a JSON array of products or an object with a `products` array."],
      warnings,
    };
  }

  const currency = String(root.currency ?? "cents").toLowerCase();
  const scale = currency === "usd" || currency === "dollar" || currency === "dollars" ? 100 : 1;

  rawList.forEach((entry, index) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    // Money unit: payload-level `currency`, overridable per row. Values are
    // integer cents by default; "usd" scales dollars up by 100.
    const rowCurrency = String(row.currency ?? root.currency ?? "cents").toLowerCase();
    const scale = ["usd", "dollar", "dollars"].includes(rowCurrency) ? 100 : 1;
    const name = String(row.name ?? row.title ?? row.product ?? "").trim();
    const sku = String(row.sku ?? row.SKU ?? row.code ?? row.itemCode ?? "").trim().toUpperCase();

    if (!name && !sku) {
      errors.push(`Row ${index + 1}: both name and SKU are missing — skipped.`);
      return;
    }
    if (!name) {
      errors.push(`Row ${index + 1} (${sku}): name is required — skipped.`);
      return;
    }
    if (!sku) {
      errors.push(`Row ${index + 1} (${name}): SKU is required — skipped.`);
      return;
    }

    const category = guessCategory(row.category ?? row.department ?? row.type);
    if (!category) {
      errors.push(
        `Row ${index + 1} (${sku}): unknown category “${String(row.category ?? "")}”. Use supplements, pantry or home — skipped.`,
      );
      return;
    }

    const casePrice = toInt(row.casePrice ?? row.price ?? row.wholesalePrice ?? row.unitPrice);
    if (casePrice <= 0) {
      errors.push(`Row ${index + 1} (${sku}): case price must be greater than zero — skipped.`);
      return;
    }

    const casePriceCents = casePrice * scale;
    if (casePriceCents > 2_000_000) {
      warnings.push(
        `${sku}: case price resolves to ${casePriceCents} cents (${(casePriceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}) — double-check the money unit for this row (set "currency": "cents" or "usd" explicitly).`,
      );
    }

    const caseSize = Math.max(1, toInt(row.caseSize ?? row.unitsPerCase ?? row.packSize ?? row.qty ?? 1, 1));
    const msrpUnit = Math.max(
      0,
      toInt(row.msrpUnit ?? row.msrp ?? row.retailPrice ?? row.suggestedRetail ?? Math.round((casePrice / caseSize) * 1.6)),
    );

    const dimensionsRaw = (row.dimensions ?? {}) as Record<string, unknown>;
    const dimensions = {
      l: Math.max(1, toInt(dimensionsRaw.l ?? dimensionsRaw.length ?? row.length ?? 12, 12)),
      w: Math.max(1, toInt(dimensionsRaw.w ?? dimensionsRaw.width ?? row.width ?? 10, 10)),
      h: Math.max(1, toInt(dimensionsRaw.h ?? dimensionsRaw.height ?? row.height ?? 8, 8)),
    };

    const tiers = Array.isArray(row.priceTiers)
      ? (row.priceTiers as unknown[])
          .map((tier) => {
            const entry = (tier ?? {}) as Record<string, unknown>;
            return {
              minCases: Math.max(1, toInt(entry.minCases ?? entry.qty ?? entry.cases)),
              casePrice: toInt(entry.casePrice ?? entry.price),
            };
          })
          .filter((tier) => tier.minCases > 0 && tier.casePrice > 0)
      : [];

    const specs = Array.isArray(row.specs)
      ? (row.specs as unknown[])
          .map((spec) => {
            const entry = (spec ?? {}) as Record<string, unknown>;
            return { label: String(entry.label ?? entry.name ?? "").trim(), value: String(entry.value ?? "").trim() };
          })
          .filter((spec) => spec.label && spec.value)
      : [];

    products.push({
      sku,
      slug: slugify(String(row.slug ?? "")) || slugify(name),
      name,
      category,
      tagline: String(row.tagline ?? row.subtitle ?? "").trim() || `${caseSize} units per case · case-packed`,
      description: String(row.description ?? row.body ?? "").trim() || `${name} — wholesale case pricing from Ciputra Corp.`,
      story: String(row.story ?? row.sourcing ?? "").trim() || "Sourced and case-packed by Ciputra Corp.",
      brand: String(row.brand ?? row.vendor ?? "Ciputra Corp.").trim(),
      origin: String(row.origin ?? row.country ?? "United States").trim(),
      msrpUnit: msrpUnit * scale,
      casePrice: casePrice * scale,
      caseSize,
      minCases: Math.max(1, toInt(row.minCases ?? 1, 1)),
      priceTiers: tiers.map((tier) => ({ ...tier, casePrice: tier.casePrice * scale })),
      weightLbs: Math.max(1, toInt(row.weightLbs ?? row.weight ?? 8, 8)),
      dimensions,
      stock: Math.max(0, toInt(row.stock ?? row.inventory ?? row.onHand ?? 50, 50)),
      leadTimeDays: Math.max(0, toInt(row.leadTimeDays ?? row.leadTime ?? 2, 2)),
      ratingX10: Math.min(50, Math.max(0, toInt(row.ratingX10 ?? 45, 45))),
      reviewCount: Math.max(0, toInt(row.reviewCount ?? 0, 0)),
      image: String(row.image ?? row.imageUrl ?? row.photo ?? "").trim() || "/images/cat-supplements.jpg",
      images: toStringList(row.images),
      features: toStringList(row.features ?? row.bullets),
      specs,
      badges: toStringList(row.badges),
      featured: Boolean(row.featured),
      active: row.active === undefined ? true : Boolean(row.active),
      taxClass: isTaxClass(row.taxClass) ? row.taxClass : defaultTaxClass(category),
    });
  });

  if (!products.length && !errors.length) {
    errors.push("No orderable rows found in the payload.");
  }

  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.sku)) warnings.push(`Duplicate SKU in file: ${product.sku} — later rows overwrite earlier ones.`);
    seen.add(product.sku);
    if (!product.images.length) product.images = [product.image];
  }

  return { products, errors, warnings };
}

export function serializeCatalog(rows: Product[]): CatalogExport {
  return {
    exportedAt: new Date().toISOString(),
    generator: "Ciputra Corp. admin catalog export",
    currency: "cents",
    count: rows.length,
    products: rows,
  };
}

export function catalogSummary(products: NormalizedProduct[]) {
  return {
    products: products.length,
    categories: Array.from(new Set(products.map((product) => product.category))).sort(),
    avgCasePrice: products.length
      ? Math.round(products.reduce((sum, product) => sum + product.casePrice, 0) / products.length)
      : 0,
  };
}
