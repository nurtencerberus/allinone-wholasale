import { describe, expect, it } from "vitest";
import { defaultTaxClass, exemptionApplies, quoteTax } from "@/lib/tax";

const exemption = (overrides = {}) => ({
  taxExempt: true,
  taxExemptState: "NJ",
  taxExemptCertNumber: "ST3-1",
  taxExemptExpires: null,
  ...overrides,
});

describe("quoteTax (NJ only)", () => {
  it("collects nothing outside New Jersey", () => {
    const quote = quoteTax({ state: "PA", lines: [{ amount: 10_000, taxClass: "general" }], shipping: 2_000 });
    expect(quote).toMatchObject({ amount: 0, source: "no_nexus" });
  });

  it("taxes general merchandise and its freight at 6.625%", () => {
    const quote = quoteTax({ state: "NJ", lines: [{ amount: 10_000, taxClass: "general" }], shipping: 2_000 });
    expect(quote.rateX1000).toBe(66.25);
    expect(quote.taxableAmount).toBe(12_000);
    expect(quote.amount).toBe(795); // 12,000 × 6.625% = 795
  });

  it("exempts food and dietary supplements, including their freight", () => {
    const quote = quoteTax({
      state: "NJ",
      lines: [{ amount: 8_000, taxClass: "food" }, { amount: 4_000, taxClass: "supplement" }],
      shipping: 3_000,
    });
    expect(quote.amount).toBe(0);
    expect(quote.source).toBe("state_rate");
  });

  it("taxes freight in proportion to the taxable goods on a mixed order", () => {
    const quote = quoteTax({
      state: "NJ",
      lines: [{ amount: 6_000, taxClass: "general" }, { amount: 4_000, taxClass: "food" }],
      shipping: 1_000,
    });
    expect(quote.taxableAmount).toBe(6_600); // 6,000 + 60% of 1,000
    expect(quote.amount).toBe(437); // 6,600 × 6.625% = 437.25
  });

  it("taxes candy", () => {
    expect(quoteTax({ state: "NJ", lines: [{ amount: 1_000, taxClass: "candy" }], shipping: 0 }).amount).toBe(66);
  });

  it("applies a resale exemption only for its state, with a certificate, before expiry", () => {
    const lines = [{ amount: 10_000, taxClass: "general" }];
    expect(quoteTax({ state: "NJ", lines, shipping: 0, exemption: exemption() }).amount).toBe(0);
    expect(quoteTax({ state: "NJ", lines, shipping: 0, exemption: exemption({ taxExemptState: "NY" }) }).amount).toBe(663);
    expect(quoteTax({ state: "NJ", lines, shipping: 0, exemption: exemption({ taxExemptCertNumber: null }) }).amount).toBe(663);
    expect(
      quoteTax({ state: "NJ", lines, shipping: 0, exemption: exemption({ taxExemptExpires: new Date(Date.now() - 1000) }) }).amount,
    ).toBe(663);
  });
});

describe("tax helpers", () => {
  it("defaults tax class from category", () => {
    expect(defaultTaxClass("supplements")).toBe("supplement");
    expect(defaultTaxClass("pantry")).toBe("food");
    expect(defaultTaxClass("home")).toBe("general");
  });
  it("exemptionApplies is false without the flag", () => {
    expect(exemptionApplies(exemption({ taxExempt: false }), "NJ")).toBe(false);
  });
});
