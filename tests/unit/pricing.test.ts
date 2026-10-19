import { describe, expect, it } from "vitest";
import { allocateDiscount, resolveCasePrice } from "@/lib/checkout";
import { canSeePrices } from "@/lib/access";
import { safeNextPath } from "@/lib/auth";

describe("resolveCasePrice", () => {
  const product = { casePrice: 10_000, priceTiers: [{ minCases: 5, casePrice: 9_000 }, { minCases: 10, casePrice: 8_500 }] };
  it.each([[1, 10_000], [5, 9_000], [9, 9_000], [10, 8_500], [50, 8_500]])("%i cases → %i", (cases, price) =>
    expect(resolveCasePrice(product, cases)).toBe(price),
  );
});

describe("allocateDiscount", () => {
  it("spreads a discount by value and keeps the total exact", () => {
    const net = allocateDiscount([3_333, 3_333, 3_334], 1_000);
    expect(net.reduce((a, b) => a + b, 0)).toBe(9_000);
  });
  it("is a no-op without a discount", () => expect(allocateDiscount([100, 200], 0)).toEqual([100, 200]));
});

describe("access", () => {
  it("only approved wholesale accounts and admins see prices", () => {
    expect(canSeePrices(null)).toBe(false);
    expect(canSeePrices({ role: "customer", accountTier: "retail" })).toBe(false);
    expect(canSeePrices({ role: "customer", accountTier: "wholesale" })).toBe(true);
    expect(canSeePrices({ role: "admin", accountTier: "retail" })).toBe(true);
  });
  it.each([
    ["/checkout", "/checkout"],
    ["https://evil.example", undefined],
    ["//evil.example", undefined],
    ["/\\evil.example", undefined],
    [undefined, undefined],
  ])("safeNextPath(%s) → %s", (input, expected) => expect(safeNextPath(input)).toBe(expected));
});
