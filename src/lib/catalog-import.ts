import type { Product } from "@/db/schema";

export const CATALOG_CATEGORIES = ["supplements", "pantry", "home"] as const;

/**
 * One product row from an import file, mapped onto the field names that
 * validateProductInput() (src/lib/product-input.ts) understands, money already in cents.
 * The import route validates every row with it — the same rules as the admin form.
 */
export type ImportRow = {
  row: number;
  sku: string;
  input: Record<string, unknown>;
  /** Requested slug for a new product; existing products keep theirs. */
  slug: string | null;
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

const first = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

/** Money: cents by default, `currency: "usd"` (file or row) means dollars. Blank stays blank. */
function money(value: unknown, scale: number): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const number = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? Math.round(number * scale) : Number.NaN;
}

/**
 * Accepts either `{ products: [...] }` or a bare array, in cents (default) or dollars
 * (`currency: "usd"`). Tolerant of the field names another storefront export typically uses
 * (title/name, price/casePrice, qty/caseSize, upc/gtin…). Ratings and review counts in the
 * file are ignored — only real reviews are ever shown.
 */
export function normalizeCatalogPayload(payload: unknown): { rows: ImportRow[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ImportRow[] = [];

  const root = (payload ?? {}) as Record<string, unknown>;
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(root.products)
      ? (root.products as unknown[])
      : Array.isArray(root.items)
        ? (root.items as unknown[])
        : null;

  if (!rawList) {
    return { rows, errors: ["Expected a JSON array of products or an object with a `products` array."], warnings };
  }
  if (rawList.length > 2000) {
    return { rows, errors: ["Import at most 2,000 products per file."], warnings };
  }

  let ignoredRatings = false;
  const seen = new Map<string, number>();

  rawList.forEach((entry, index) => {
    const rowNumber = index + 1;
    const row = (entry ?? {}) as Record<string, unknown>;
    const rowCurrency = String(row.currency ?? root.currency ?? "cents").toLowerCase();
    const scale = ["usd", "dollar", "dollars"].includes(rowCurrency) ? 100 : 1;
    const name = String(first(row, "name", "title", "product") ?? "").trim();
    const sku = String(first(row, "sku", "SKU", "code", "itemCode") ?? "").trim().toUpperCase();

    if (!sku) {
      errors.push(`Row ${rowNumber}${name ? ` (${name})` : ""}: SKU is required.`);
      return;
    }
    if (seen.has(sku)) {
      errors.push(`Row ${rowNumber} (${sku}): duplicate of row ${seen.get(sku)} — each SKU may appear once.`);
      return;
    }
    seen.set(sku, rowNumber);

    const category = guessCategory(first(row, "category", "department", "type"));
    if (!category) {
      errors.push(`Row ${rowNumber} (${sku}): unknown category “${String(row.category ?? "")}”. Use supplements, pantry or home.`);
      return;
    }
    if (row.ratingX10 !== undefined || row.reviewCount !== undefined || row.rating !== undefined) ignoredRatings = true;

    const casePrice = money(first(row, "casePrice", "price", "wholesalePrice", "unitPrice"), scale);
    if (casePrice !== undefined && casePrice > 2_000_000) {
      warnings.push(`${sku}: case price resolves to $${(casePrice / 100).toLocaleString("en-US")} — check the money unit ("currency": "cents" or "usd").`);
    }
    const dimensionsRaw = (row.dimensions ?? {}) as Record<string, unknown>;
    const tiers = Array.isArray(row.priceTiers)
      ? (row.priceTiers as unknown[]).map((tier) => {
          const value = (tier ?? {}) as Record<string, unknown>;
          return { minCases: first(value, "minCases", "qty", "cases"), casePrice: money(first(value, "casePrice", "price"), scale) };
        })
      : [];
    const specs = Array.isArray(row.specs)
      ? (row.specs as unknown[]).map((spec) => {
          const value = (spec ?? {}) as Record<string, unknown>;
          return { label: String(value.label ?? value.name ?? ""), value: String(value.value ?? "") };
        })
      : [];
    const image = String(first(row, "image", "imageUrl", "photo") ?? "").trim();
    const images = toStringList(row.images);

    rows.push({
      row: rowNumber,
      sku,
      slug: slugify(String(row.slug ?? "")) || null,
      input: {
        name,
        sku,
        category,
        taxClass: row.taxClass,
        brand: first(row, "brand", "vendor"),
        origin: row.origin,
        tagline: first(row, "tagline", "subtitle"),
        description: first(row, "description", "body"),
        story: first(row, "story", "sourcing"),
        casePrice,
        msrpUnit: money(first(row, "msrpUnit", "msrp", "retailPrice", "suggestedRetail"), scale),
        caseSize: first(row, "caseSize", "unitsPerCase", "packSize", "qty"),
        minCases: row.minCases,
        priceTiers: tiers,
        weightLbs: first(row, "weightLbs", "weight"),
        dimensions: {
          l: first(dimensionsRaw, "l", "length") ?? row.length,
          w: first(dimensionsRaw, "w", "width") ?? row.width,
          h: first(dimensionsRaw, "h", "height") ?? row.height,
        },
        leadTimeDays: first(row, "leadTimeDays", "leadTime"),
        images: images.length ? images : image ? [image] : [],
        features: toStringList(first(row, "features", "bullets")),
        specs,
        badges: toStringList(row.badges),
        featured: Boolean(row.featured),
        active: row.active === undefined ? true : Boolean(row.active),
        gtin: first(row, "gtin", "upc", "ean", "barcode"),
        caseGtin: first(row, "caseGtin", "itf14"),
        asin: row.asin,
        mpn: row.mpn,
        manufacturer: row.manufacturer,
        supplierName: first(row, "supplierName", "supplier"),
        supplierSku: row.supplierSku,
        supplierUrl: row.supplierUrl,
        costPrice: money(first(row, "costPrice", "cost", "landedCost"), scale),
        mapPrice: money(first(row, "mapPrice", "map"), scale),
        unitsPerPallet: first(row, "unitsPerPallet", "casesPerPallet"),
        palletTi: first(row, "palletTi", "ti"),
        palletHi: first(row, "palletHi", "hi"),
        freightClass: row.freightClass,
        nmfc: row.nmfc,
        hazmat: Boolean(row.hazmat),
        unNumber: row.unNumber,
        htsCode: first(row, "htsCode", "hts"),
        countryOfOrigin: first(row, "countryOfOrigin", "coo"),
        shelfLifeDays: row.shelfLifeDays,
        ingredients: row.ingredients,
        allergens: toStringList(row.allergens),
        factsPanelImage: row.factsPanelImage,
        fdaDisclaimer: row.fdaDisclaimer,
        prop65Warning: row.prop65Warning,
        certifications: Array.isArray(row.certifications) ? row.certifications : [],
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        reorderPoint: row.reorderPoint,
        // Opening stock applies to new products only; existing stock changes through lots.
        openingStock: first(row, "openingStock", "stock", "inventory", "onHand"),
        openingLot: first(row, "openingLot", "lot", "lotNumber"),
        openingExpiresOn: first(row, "openingExpiresOn", "bestBy", "expiresOn", "expiry"),
      },
    });
  });

  if (ignoredRatings) warnings.push("Ratings and review counts in the file were ignored — only real reviews are shown.");
  if (!rows.length && !errors.length) errors.push("No product rows found in the payload.");
  return { rows, errors, warnings };
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
