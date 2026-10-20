import { describe, expect, it } from "vitest";
import { applyFreightAllowance, dimensionalWeight, summariseFreight, zoneFor, type ShippingOption } from "@/lib/shipping";
import { lbsToOz, ozToLbs } from "@/lib/weight";
import { SITE } from "@/lib/site";

const small = { l: 10, w: 8, h: 6 };
const bulky = { l: 24, w: 18, h: 16 };

describe("weight conversion", () => {
  it("keeps a light carton's weight instead of rounding it to a pound", () => {
    expect(lbsToOz(0.6)).toBe(10);
    expect(ozToLbs(10)).toBe(0.63);
  });
  it("round-trips a whole number of pounds", () => expect(ozToLbs(lbsToOz(14))).toBe(14));
});

describe("dimensionalWeight", () => {
  it("prices a 10 oz carton as 0.63 lb, not 0 or 1", () => {
    const line = { weightOz: 10, dimensions: small, cases: 1 };
    expect(dimensionalWeight(line).actualLbs).toBe(0.63);
  });
  it("bills the greater of actual and dimensional weight per carton", () => {
    // 24 × 18 × 16 in ÷ 139 = 49.7 lb dim against a 2 lb actual carton.
    const line = { weightOz: lbsToOz(2), dimensions: bulky, cases: 1 };
    const { billablePerCarton } = dimensionalWeight(line);
    expect(billablePerCarton).toBeGreaterThan(49);
    expect(billablePerCarton).toBeLessThan(51);
  });
});

describe("summariseFreight", () => {
  it("adds packaging to every carton, not once to the shipment", () => {
    const one = summariseFreight([{ weightOz: lbsToOz(10), dimensions: small, cases: 1 }]);
    const ten = summariseFreight([{ weightOz: lbsToOz(10), dimensions: small, cases: 10 }]);
    const packaging = one.billableLbs - 10;
    expect(packaging).toBeGreaterThan(0);
    expect(ten.billableLbs).toBeCloseTo(10 * one.billableLbs, 1);
  });

  it("does not under-bill one heavy carton mixed with bulky light ones", () => {
    const lines = [
      { weightOz: lbsToOz(40), dimensions: small, cases: 1 },
      { weightOz: lbsToOz(1), dimensions: bulky, cases: 4 },
    ];
    const summary = summariseFreight(lines);
    const totalActual = 40 + 4;
    const totalDim = ((bulky.l * bulky.w * bulky.h) / 139) * 4 + (small.l * small.w * small.h) / 139;
    // Taking the greater of the two totals once would miss the heavy carton entirely.
    expect(summary.billableLbs).toBeGreaterThan(Math.max(totalActual, totalDim));
  });

  it("goes to pallets on a heavy carton even when the shipment is light", () => {
    expect(summariseFreight([{ weightOz: lbsToOz(45), dimensions: small, cases: 1 }]).palletised).toBe(true);
    expect(summariseFreight([{ weightOz: lbsToOz(5), dimensions: small, cases: 1 }]).palletised).toBe(false);
  });

  it("reports hazmat when any line carries it", () => {
    const lines = [
      { weightOz: 32, dimensions: small, cases: 1 },
      { weightOz: 32, dimensions: small, cases: 1, hazmat: true },
    ];
    expect(summariseFreight(lines).hazmat).toBe(true);
    expect(summariseFreight([lines[0]]).hazmat).toBe(false);
  });
});

describe("applyFreightAllowance", () => {
  const option = (over: Partial<ShippingOption>): ShippingOption => ({
    id: "ups-ground",
    carrier: "UPS",
    service: "Ground",
    cost: 2_500,
    transitDays: "3 days",
    ground: true,
    mode: "parcel",
    billableLbs: 20,
    dimWeightLbs: 18,
    note: "",
    ...over,
  });
  const over = SITE.freeFreightThreshold;

  it("waives ground parcel once the threshold is met", () => {
    const [waived] = applyFreightAllowance([option({})], over, 3, false);
    expect(waived.cost).toBe(0);
    expect(waived.note).toMatch(/Freight allowance/);
  });
  it("leaves air and LTL alone", () => {
    const options = [option({ id: "ups-2day", ground: false }), option({ id: "ltl", ground: false, mode: "ltl" })];
    expect(applyFreightAllowance(options, over, 3, false).map((entry) => entry.cost)).toEqual([2_500, 2_500]);
  });
  it("does not apply below the threshold, on a pallet, or outside the covered zones", () => {
    expect(applyFreightAllowance([option({})], over - 1, 3, false)[0].cost).toBe(2_500);
    expect(applyFreightAllowance([option({})], over, 3, true)[0].cost).toBe(2_500);
    expect(applyFreightAllowance([option({})], over, 8, false)[0].cost).toBe(2_500);
  });
});

describe("zoneFor", () => {
  it("maps the home state to its own zone and falls back in the middle", () => {
    expect(zoneFor(SITE.state)).toBe(2);
    expect(zoneFor("CA")).toBe(8);
    expect(zoneFor("")).toBe(5);
  });
});
