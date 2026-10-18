import type { Dimensions, PriceTier } from "@/db/schema";
import { CATEGORIES } from "@/lib/site";

export type ProductValues = {
  sku: string;
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
  priceTiers: PriceTier[];
  weightLbs: number;
  dimensions: Dimensions;
  stock: number;
  leadTimeDays: number;
  image: string;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  badges: string[];
  featured: boolean;
  active: boolean;
};

type Result = { ok: true; values: ProductValues } | { ok: false; error: string };

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9\-_.]{2,31}$/;
const MAX_CENTS = 10_000_000; // $100,000 per case

export function slugifyName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ç/g, "c")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function int(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : Number.NaN;
  const raw = String(value ?? "").trim();
  if (raw === "") return Number.NaN; // blank is "missing", never silently 0
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : Number.NaN;
}

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/\n+/);
  return source
    .map((entry) => text(entry, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function imageUrl(value: unknown): string | null {
  const url = text(value, 500);
  if (!url) return null;
  // Same-site paths (including uploaded photos) or absolute http(s) URLs only.
  if (/^\/(?!\/)[^\s]*$/.test(url) || /^https?:\/\/[^\s]+$/i.test(url)) return url;
  return null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Validates a product form payload (money in integer cents) and fills sensible defaults. */
export function validateProductInput(body: unknown): Result {
  const input = (body ?? {}) as Record<string, unknown>;

  const name = text(input.name, 120);
  if (name.length < 3) return { ok: false, error: "Product name must be at least 3 characters." };

  const sku = text(input.sku, 32).toUpperCase().replace(/\s+/g, "-");
  if (!SKU_PATTERN.test(sku)) {
    return {
      ok: false,
      error: "SKU must be 3–32 characters: letters, numbers, dashes, dots or underscores (e.g. MSC-VIT-100).",
    };
  }

  const category = text(input.category, 20);
  if (!CATEGORIES.some((entry) => entry.key === category)) {
    return { ok: false, error: "Choose a department: supplements, pantry or home." };
  }

  const caseSize = int(input.caseSize);
  if (!Number.isFinite(caseSize) || caseSize < 1 || caseSize > 1000) {
    return { ok: false, error: "Units per case must be a whole number from 1 to 1,000." };
  }

  const casePrice = int(input.casePrice);
  if (!Number.isFinite(casePrice) || casePrice < 1 || casePrice > MAX_CENTS) {
    return { ok: false, error: "Case price must be greater than $0 and at most $100,000." };
  }

  const msrpRaw = input.msrpUnit === "" || input.msrpUnit === undefined ? 0 : int(input.msrpUnit);
  if (!Number.isFinite(msrpRaw) || msrpRaw < 0 || msrpRaw > MAX_CENTS) {
    return { ok: false, error: "Suggested retail price per unit is not valid." };
  }
  // Default MSRP: a 1.6x keystone-style markup on unit cost.
  const msrpUnit = msrpRaw > 0 ? msrpRaw : Math.round((casePrice / caseSize) * 1.6);

  const minCases = input.minCases === "" || input.minCases === undefined ? 1 : int(input.minCases);
  if (!Number.isFinite(minCases) || minCases < 1 || minCases > 999) {
    return { ok: false, error: "Minimum order must be between 1 and 999 cases." };
  }

  // Volume tiers: ascending quantity, strictly falling price.
  const rawTiers = Array.isArray(input.priceTiers) ? input.priceTiers : [];
  const tiers: PriceTier[] = [];
  for (const entry of rawTiers) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const tierMin = int(row.minCases);
    const tierPrice = int(row.casePrice);
    if (Number.isNaN(tierMin) && Number.isNaN(tierPrice)) continue; // blank row
    if (!Number.isFinite(tierMin) || !Number.isFinite(tierPrice)) {
      return { ok: false, error: "Each volume tier needs both a quantity and a price." };
    }
    if (tierMin < 2 || tierMin > 999) {
      return { ok: false, error: "Volume tiers start at 2 cases or more." };
    }
    if (tierPrice < 1) return { ok: false, error: "Volume tier prices must be greater than $0." };
    tiers.push({ minCases: tierMin, casePrice: tierPrice });
  }
  tiers.sort((a, b) => a.minCases - b.minCases);
  if (tiers.length > 5) return { ok: false, error: "Use at most 5 volume tiers." };
  let previousMin = 1;
  let previousPrice = casePrice;
  for (const tier of tiers) {
    if (tier.minCases === previousMin) {
      return { ok: false, error: `Two volume tiers both start at ${tier.minCases} cases.` };
    }
    if (tier.casePrice >= previousPrice) {
      return {
        ok: false,
        error: `The ${tier.minCases}+ case tier (${dollars(tier.casePrice)}) must be cheaper than the tier before it (${dollars(previousPrice)}).`,
      };
    }
    previousMin = tier.minCases;
    previousPrice = tier.casePrice;
  }

  const weightLbs = int(input.weightLbs);
  if (!Number.isFinite(weightLbs) || weightLbs < 1 || weightLbs > 2000) {
    return { ok: false, error: "Carton weight must be a whole number of pounds from 1 to 2,000." };
  }

  const dimensions: Dimensions = {
    l: int((input.dimensions as Record<string, unknown> | undefined)?.l),
    w: int((input.dimensions as Record<string, unknown> | undefined)?.w),
    h: int((input.dimensions as Record<string, unknown> | undefined)?.h),
  };
  for (const [axis, value] of Object.entries(dimensions)) {
    if (!Number.isFinite(value) || value < 1 || value > 120) {
      return {
        ok: false,
        error: `Carton ${axis === "l" ? "length" : axis === "w" ? "width" : "height"} must be 1–120 inches — dimensional freight depends on it.`,
      };
    }
  }

  const stock = int(input.stock);
  if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
    return { ok: false, error: "Stock must be a whole number of cases (0 or more)." };
  }

  const leadRaw = input.leadTimeDays === "" || input.leadTimeDays === undefined ? 2 : int(input.leadTimeDays);
  if (!Number.isFinite(leadRaw) || leadRaw < 0 || leadRaw > 60) {
    return { ok: false, error: "Dispatch lead time must be 0–60 days." };
  }

  const description = text(input.description, 4000);
  if (description.length < 10) {
    return { ok: false, error: "Add a product description (at least 10 characters)." };
  }

  const rawImages = Array.isArray(input.images) ? input.images : [];
  const images: string[] = [];
  for (const entry of rawImages) {
    const url = imageUrl(entry);
    if (!url) return { ok: false, error: `“${text(entry, 60)}” is not a valid image URL or uploaded photo.` };
    if (!images.includes(url)) images.push(url);
  }
  if (images.length > 8) return { ok: false, error: "Use at most 8 product photos." };
  const fallbackImage = CATEGORIES.find((entry) => entry.key === category)?.image ?? "/images/cat-supplements.jpg";
  const gallery = images.length ? images : [fallbackImage];

  const rawSpecs = Array.isArray(input.specs) ? input.specs : [];
  let specs = rawSpecs
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return { label: text(row.label, 60), value: text(row.value, 160) };
    })
    .filter((row) => row.label && row.value)
    .slice(0, 12);

  if (!specs.length) {
    specs = [
      { label: "Units per case", value: `${caseSize} unit${caseSize === 1 ? "" : "s"}` },
      { label: "Suggested retail", value: `${dollars(msrpUnit)} / unit` },
      {
        label: "Case weight / dims",
        value: `${weightLbs} lb · ${dimensions.l} × ${dimensions.w} × ${dimensions.h} in`,
      },
    ];
  }

  const brand = text(input.brand, 80) || "Meridian Supply Co.";
  return {
    ok: true,
    values: {
      sku,
      name,
      category,
      tagline: text(input.tagline, 160) || `${caseSize} unit${caseSize === 1 ? "" : "s"} per case · case-packed`,
      description,
      story: text(input.story, 1500) || `Sourced and case-packed for wholesale by ${brand}.`,
      brand,
      origin: text(input.origin, 80) || "United States",
      msrpUnit,
      casePrice,
      caseSize,
      minCases,
      priceTiers: tiers,
      weightLbs,
      dimensions,
      stock,
      leadTimeDays: leadRaw,
      image: gallery[0],
      images: gallery,
      features: list(input.features, 12, 160),
      specs,
      badges: list(input.badges, 4, 24),
      featured: Boolean(input.featured),
      active: input.active === undefined ? true : Boolean(input.active),
    },
  };
}

/** Detects a spreadsheet-safe image type from magic bytes (SVG is intentionally rejected). */
export function sniffImage(data: Buffer): { mime: string; ext: string } | null {
  if (data.length > 12 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (data.length > 6 && data.subarray(0, 4).toString("ascii") === "GIF8") {
    return { mime: "image/gif", ext: "gif" };
  }
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}
