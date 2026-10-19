import type { Certification, Dimensions, PriceTier } from "@/db/schema";
import { CATEGORIES } from "@/lib/site";
import { defaultTaxClass, isTaxClass } from "@/lib/tax";
import {
  ALLERGENS,
  FREIGHT_CLASSES,
  isValidAsin,
  isValidGtin,
  normaliseAsin,
  normaliseGtin,
  regionName,
} from "@/lib/product-data";

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
  leadTimeDays: number;
  image: string;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  badges: string[];
  featured: boolean;
  active: boolean;
  taxClass: string;
  gtin: string | null;
  caseGtin: string | null;
  asin: string | null;
  mpn: string | null;
  manufacturer: string | null;
  supplierName: string | null;
  supplierSku: string | null;
  supplierUrl: string | null;
  costPrice: number | null;
  mapPrice: number | null;
  unitsPerPallet: number | null;
  palletTi: number | null;
  palletHi: number | null;
  freightClass: string | null;
  nmfc: string | null;
  hazmat: boolean;
  unNumber: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  shelfLifeDays: number | null;
  ingredients: string | null;
  allergens: string[];
  factsPanelImage: string | null;
  fdaDisclaimer: boolean;
  prop65Warning: string | null;
  certifications: Certification[];
  seoTitle: string | null;
  seoDescription: string | null;
  reorderPoint: number;
};

/** Opening stock for a new product: becomes its first lot (STK-3). */
export type OpeningStock = { cases: number; lotNumber: string; expiresOn: string | null } | null;

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
  // Same-site paths (including uploaded photos) or absolute https URLs only — http:// would
  // be blocked as mixed content on the https storefront.
  if (/^\/(?!\/)[^\s]*$/.test(url) || /^https:\/\/[^\s]+$/i.test(url)) return url;
  return null;
}

function httpsUrl(value: unknown): string | null {
  const url = text(value, 500);
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

/** Optional whole number in a range: blank → null, invalid → NaN. */
function optionalInt(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = int(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : Number.NaN;
}

const optionalText = (value: unknown, max: number) => text(value, max) || null;

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
  const unitWholesale = Math.ceil(casePrice / caseSize);
  if (msrpUnit < unitWholesale) {
    return {
      ok: false,
      error: `Suggested retail (${dollars(msrpUnit)}) is below the wholesale unit price (${dollars(unitWholesale)}) — retailers would lose money.`,
    };
  }

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
    if (tierMin <= minCases || tierMin > 999) {
      return { ok: false, error: `Volume tiers must start above the ${minCases}-case minimum order.` };
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

  const taxClassInput = text(input.taxClass, 20);
  if (taxClassInput && !isTaxClass(taxClassInput)) {
    return { ok: false, error: "Tax class must be general, food, supplement or candy." };
  }
  const taxClass = taxClassInput || defaultTaxClass(category);

  const brand = text(input.brand, 80);
  if (brand.length < 2) return { ok: false, error: "Enter the brand shown on the label." };

  // Identity --------------------------------------------------------------
  const gtinRaw = normaliseGtin(input.gtin);
  if (gtinRaw && !isValidGtin(gtinRaw)) {
    return { ok: false, error: `UPC / GTIN ${gtinRaw} is not valid — check the digits (GS1 check digit).` };
  }
  const caseGtinRaw = normaliseGtin(input.caseGtin);
  if (caseGtinRaw && (caseGtinRaw.length !== 14 || !isValidGtin(caseGtinRaw))) {
    return { ok: false, error: "Case GTIN must be a valid 14-digit ITF-14 code." };
  }
  if (gtinRaw && gtinRaw === caseGtinRaw) return { ok: false, error: "Unit and case GTIN must differ." };
  const asinRaw = normaliseAsin(input.asin);
  if (asinRaw && !isValidAsin(asinRaw)) {
    return { ok: false, error: "ASIN must be 10 characters, e.g. B0ABC12345." };
  }
  const supplierUrlRaw = text(input.supplierUrl, 500);
  const supplierUrl = supplierUrlRaw ? httpsUrl(supplierUrlRaw) : null;
  if (supplierUrlRaw && !supplierUrl) return { ok: false, error: "Supplier URL must start with https://." };

  // Money -----------------------------------------------------------------
  const costPrice = optionalInt(input.costPrice, 0, MAX_CENTS);
  if (Number.isNaN(costPrice)) return { ok: false, error: "Landed cost per case is not valid." };
  const mapPrice = optionalInt(input.mapPrice, 0, MAX_CENTS);
  if (Number.isNaN(mapPrice)) return { ok: false, error: "MAP per unit is not valid." };
  if (mapPrice !== null && mapPrice > msrpUnit) {
    return { ok: false, error: "MAP (minimum advertised price) cannot be above the suggested retail price." };
  }

  // Logistics -------------------------------------------------------------
  const unitsPerPallet = optionalInt(input.unitsPerPallet, 1, 1000);
  const palletTi = optionalInt(input.palletTi, 1, 100);
  const palletHi = optionalInt(input.palletHi, 1, 100);
  if ([unitsPerPallet, palletTi, palletHi].some(Number.isNaN)) {
    return { ok: false, error: "Pallet figures must be whole numbers (cases per pallet 1–1,000, TI and HI 1–100)." };
  }
  const freightClass = text(input.freightClass, 6) || null;
  if (freightClass && !(FREIGHT_CLASSES as readonly string[]).includes(freightClass)) {
    return { ok: false, error: `Freight class must be one of the NMFC classes (${FREIGHT_CLASSES.join(", ")}).` };
  }
  const hazmat = Boolean(input.hazmat);
  const unNumber = text(input.unNumber, 8).toUpperCase() || null;
  if (unNumber && !/^UN\d{4}$/.test(unNumber)) return { ok: false, error: "UN number looks like UN1234." };
  if (hazmat && !unNumber) return { ok: false, error: "Hazardous materials need a UN number." };
  const htsCode = text(input.htsCode, 14) || null;
  if (htsCode && !/^\d{4}(\.?\d{2}){0,3}$/.test(htsCode)) return { ok: false, error: "HTS code looks like 2106.90.9998." };
  const countryRaw = text(input.countryOfOrigin, 2).toUpperCase();
  if (countryRaw && !regionName(countryRaw)) {
    return { ok: false, error: "Country of origin must be a two-letter ISO code (US, CA, IT…)." };
  }
  const countryOfOrigin = countryRaw || null;

  // Compliance ------------------------------------------------------------
  const shelfLifeDays = optionalInt(input.shelfLifeDays, 1, 3650);
  if (Number.isNaN(shelfLifeDays)) return { ok: false, error: "Shelf life must be 1–3,650 days." };
  const allergens = list(input.allergens, ALLERGENS.length, 40).map((entry) => entry.toLowerCase());
  const unknownAllergen = allergens.find((entry) => !(ALLERGENS as readonly string[]).includes(entry));
  if (unknownAllergen) {
    return { ok: false, error: `“${unknownAllergen}” is not a FALCPA major allergen (${ALLERGENS.join(", ")}).` };
  }
  const factsRaw = text(input.factsPanelImage, 500);
  const factsPanelImage = factsRaw ? imageUrl(factsRaw) : null;
  if (factsRaw && !factsPanelImage) return { ok: false, error: "Facts panel image must be an uploaded photo or an https URL." };
  const rawCerts = Array.isArray(input.certifications) ? input.certifications : [];
  const certifications: Certification[] = [];
  for (const entry of rawCerts.slice(0, 8)) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const certName = text(row.name, 40);
    if (!certName) continue;
    const docRaw = text(row.documentUrl, 500);
    const documentUrl = docRaw ? imageUrl(docRaw) : null;
    if (docRaw && !documentUrl) return { ok: false, error: `Certificate document for ${certName} must be a same-site path or https URL.` };
    certifications.push({ name: certName, documentUrl });
  }

  const reorderPoint = input.reorderPoint === undefined || input.reorderPoint === "" ? 10 : int(input.reorderPoint);
  if (!Number.isFinite(reorderPoint) || reorderPoint < 0 || reorderPoint > 100_000) {
    return { ok: false, error: "Reorder point must be 0 or more cases." };
  }

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
      // No default origin: "Made in USA" is an FTC claim and must never be assumed.
      origin: text(input.origin, 80) || regionName(countryOfOrigin) || "",
      msrpUnit,
      casePrice,
      caseSize,
      minCases,
      priceTiers: tiers,
      weightLbs,
      dimensions,
      leadTimeDays: leadRaw,
      image: gallery[0],
      images: gallery,
      features: list(input.features, 12, 160),
      specs,
      badges: list(input.badges, 4, 24),
      featured: Boolean(input.featured),
      active: input.active === undefined ? true : Boolean(input.active),
      taxClass,
      gtin: gtinRaw || null,
      caseGtin: caseGtinRaw || null,
      asin: asinRaw || null,
      mpn: optionalText(input.mpn, 60),
      manufacturer: optionalText(input.manufacturer, 120),
      supplierName: optionalText(input.supplierName, 120),
      supplierSku: optionalText(input.supplierSku, 60),
      supplierUrl,
      costPrice,
      mapPrice,
      unitsPerPallet,
      palletTi,
      palletHi,
      freightClass,
      nmfc: optionalText(input.nmfc, 20),
      hazmat,
      unNumber,
      htsCode,
      countryOfOrigin,
      shelfLifeDays,
      ingredients: optionalText(input.ingredients, 4000),
      allergens,
      factsPanelImage,
      // Structure/function claims on a supplement require the DSHEA disclaimer.
      fdaDisclaimer: input.fdaDisclaimer === undefined ? taxClass === "supplement" : Boolean(input.fdaDisclaimer),
      prop65Warning: optionalText(input.prop65Warning, 600),
      certifications,
      seoTitle: optionalText(input.seoTitle, 70),
      seoDescription: optionalText(input.seoDescription, 170),
      reorderPoint,
    },
  };
}

/** Optional opening stock on a new product (becomes its first lot). */
export function parseOpeningStock(
  body: unknown,
  values: Pick<ProductValues, "sku" | "taxClass" | "shelfLifeDays">,
): { ok: true; opening: OpeningStock } | { ok: false; error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const raw = input.openingStock ?? input.stock;
  if (raw === undefined || raw === null || String(raw).trim() === "" || Number(raw) === 0) return { ok: true, opening: null };
  const cases = int(raw);
  if (!Number.isFinite(cases) || cases < 0 || cases > 1_000_000) {
    return { ok: false, error: "Opening stock must be a whole number of cases." };
  }
  const expiresOn = text(input.openingExpiresOn, 10) || null;
  if (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn)))) {
    return { ok: false, error: "Opening lot best-by date must be YYYY-MM-DD." };
  }
  if (!expiresOn && (values.taxClass !== "general" || values.shelfLifeDays)) {
    return { ok: false, error: "Food and supplement stock needs a best-by date for its lot." };
  }
  const lotNumber = text(input.openingLot, 40).toUpperCase() || `${values.sku}-OPEN`;
  return { ok: true, opening: { cases, lotNumber, expiresOn } };
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
