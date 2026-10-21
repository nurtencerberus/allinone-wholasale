import { describe, expect, it } from "vitest";
import { normalizeCatalogPayload } from "@/lib/catalog-import";
import { amazonUrl, isValidAsin, isValidGtin, regionName } from "@/lib/product-data";
import { parseOpeningStock, validateProductInput } from "@/lib/product-input";

const base = {
  name: "Magnesium Glycinate 120ct",
  sku: "MSC-MAG-120",
  category: "supplements",
  brand: "Ciputra Labs",
  description: "Chelated magnesium, 120 capsules.",
  caseSize: 12,
  casePrice: 14400,
  msrpUnit: 2499,
  weightLbs: 9,
  dimensions: { l: 12, w: 10, h: 8 },
};

describe("case weight", () => {
  const values = (input: Record<string, unknown>) => {
    const result = validateProductInput({ ...base, ...input });
    if (!result.ok) throw new Error(result.error);
    return result.values;
  };

  it("stores pounds as whole ounces", () => {
    expect(values({}).weightOz).toBe(144);
  });
  it("keeps a light carton's real weight", () => {
    expect(values({ weightLbs: 0.6 }).weightOz).toBe(10);
  });
  it("takes ounces directly when a precise weight is imported", () => {
    expect(values({ weightLbs: 9, weightOz: 137 }).weightOz).toBe(137);
  });
  it("refuses a weightless or absurd carton", () => {
    expect(validateProductInput({ ...base, weightLbs: 0 }).ok).toBe(false);
    expect(validateProductInput({ ...base, weightLbs: 2001 }).ok).toBe(false);
  });
});

describe("identifiers", () => {
  it("checks the GS1 check digit for GTIN-8/12/13/14", () => {
    expect(isValidGtin("012345678905")).toBe(true); // UPC-A
    expect(isValidGtin("012345678906")).toBe(false);
    expect(isValidGtin("4006381333931")).toBe(true); // EAN-13
    expect(isValidGtin("96385074")).toBe(true); // GTIN-8
    expect(isValidGtin("10012345678902")).toBe(true); // ITF-14
    expect(isValidGtin("12345")).toBe(false);
  });

  it("accepts ASINs and ISBN-10s, and derives the Amazon link", () => {
    expect(isValidAsin("B0ABC12345")).toBe(true);
    expect(isValidAsin("0306406152")).toBe(true);
    expect(isValidAsin("A0ABC12345")).toBe(false);
    expect(amazonUrl("b0abc12345")).toBe("https://www.amazon.com/dp/B0ABC12345");
    expect(amazonUrl("not-an-asin")).toBeNull();
  });

  it("knows ISO country codes", () => {
    expect(regionName("US")).toBe("United States");
    expect(regionName("ZZ")).toBeNull();
  });
});

describe("validateProductInput", () => {
  it("accepts a complete product and never invents an origin", () => {
    const result = validateProductInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.origin).toBe("");
      expect(result.values.fdaDisclaimer).toBe(true); // supplements default to the DSHEA disclaimer
      expect("stock" in result.values).toBe(false);
    }
  });

  it("refuses MSRP below the wholesale unit price", () => {
    expect(validateProductInput({ ...base, msrpUnit: 1000 })).toMatchObject({ ok: false });
  });

  it("requires tiers to start above the minimum order", () => {
    expect(validateProductInput({ ...base, minCases: 3, priceTiers: [{ minCases: 3, casePrice: 14000 }] })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, minCases: 3, priceTiers: [{ minCases: 4, casePrice: 14000 }] })).toMatchObject({ ok: true });
  });

  it("only allows https or same-site images", () => {
    expect(validateProductInput({ ...base, images: ["http://example.com/a.jpg"] })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, images: ["https://example.com/a.jpg", "/api/product-images/4"] })).toMatchObject({ ok: true });
  });

  it("validates compliance and logistics fields", () => {
    expect(validateProductInput({ ...base, gtin: "012345678906" })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, allergens: ["gluten"] })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, hazmat: true })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, hazmat: true, unNumber: "un1993" })).toMatchObject({ ok: true });
    expect(validateProductInput({ ...base, freightClass: "77" })).toMatchObject({ ok: false });
    expect(validateProductInput({ ...base, mapPrice: 3000 })).toMatchObject({ ok: false }); // MAP above MSRP
    expect(validateProductInput({ ...base, countryOfOrigin: "XX" })).toMatchObject({ ok: false });
    const ok = validateProductInput({ ...base, countryOfOrigin: "it", allergens: ["Milk"] });
    expect(ok.ok && ok.values.origin).toBe("Italy");
    expect(ok.ok && ok.values.allergens).toEqual(["milk"]);
  });

  it("requires a brand", () => {
    expect(validateProductInput({ ...base, brand: "" })).toMatchObject({ ok: false });
  });
});

describe("opening stock", () => {
  const values = { sku: "MSC-MAG-120", taxClass: "supplement", shelfLifeDays: null };
  it("needs a best-by date for food and supplements", () => {
    expect(parseOpeningStock({ openingStock: 10 }, values)).toMatchObject({ ok: false });
    expect(parseOpeningStock({ openingStock: 10, openingExpiresOn: "2028-01-31" }, values)).toEqual({
      ok: true,
      opening: { cases: 10, lotNumber: "MSC-MAG-120-OPEN", expiresOn: "2028-01-31" },
    });
    expect(parseOpeningStock({}, values)).toEqual({ ok: true, opening: null });
  });
});

describe("normalizeCatalogPayload", () => {
  it("maps aliases, scales dollars and refuses duplicate SKUs", () => {
    const { rows, errors, warnings } = normalizeCatalogPayload({
      currency: "usd",
      products: [
        { title: "A", sku: "a-1", category: "vitamins", price: 144, upc: "012345678905", rating: 5 },
        { name: "B", sku: "A-1", category: "pantry" },
        { name: "C", category: "home" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toMatchObject({ name: "A", sku: "A-1", category: "supplements", casePrice: 14400, gtin: "012345678905" });
    expect(errors.some((error) => error.includes("duplicate"))).toBe(true);
    expect(errors.some((error) => error.includes("SKU is required"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("Ratings"))).toBe(true);
  });
});
