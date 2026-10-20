import { describe, expect, it } from "vitest";
import { couponProblem, type CouponContext } from "@/lib/checkout";
import type { Coupon } from "@/db/schema";

const NOW = new Date("2026-06-15T12:00:00Z");

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 1,
    code: "SPRING10",
    kind: "percent",
    value: 10,
    minSubtotal: 0,
    description: "10% off",
    active: true,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    perCustomerLimit: null,
    allowedTiers: [],
    stackable: true,
    redeemedCount: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    now: NOW,
    eligibleBase: 50_000,
    accountDiscount: 0,
    accountTier: "retail",
    customerRedemptions: 0,
    ...overrides,
  };
}

describe("couponProblem", () => {
  it("accepts a plain active coupon", () => {
    expect(couponProblem(coupon(), context())).toBeNull();
  });

  it("refuses an inactive coupon", () => {
    expect(couponProblem(coupon({ active: false }), context())).toMatch(/not recognised/);
  });

  describe("window", () => {
    it("refuses before it starts", () => {
      expect(couponProblem(coupon({ startsAt: new Date("2026-07-01T00:00:00Z") }), context())).toMatch(/not available yet/);
    });
    it("refuses after it expires", () => {
      expect(couponProblem(coupon({ expiresAt: new Date("2026-06-01T00:00:00Z") }), context())).toMatch(/expired/);
    });
    it("accepts inside the window", () => {
      const inside = coupon({ startsAt: new Date("2026-06-01T00:00:00Z"), expiresAt: new Date("2026-07-01T00:00:00Z") });
      expect(couponProblem(inside, context())).toBeNull();
    });
  });

  describe("usage limits", () => {
    it("refuses once the total limit is reached", () => {
      expect(couponProblem(coupon({ maxRedemptions: 5, redeemedCount: 5 }), context())).toMatch(/fully redeemed/);
    });
    it("accepts while redemptions remain", () => {
      expect(couponProblem(coupon({ maxRedemptions: 5, redeemedCount: 4 }), context())).toBeNull();
    });
    it("refuses once this customer's limit is reached", () => {
      const once = coupon({ perCustomerLimit: 1 });
      expect(couponProblem(once, context({ customerRedemptions: 1 }))).toMatch(/already been used/);
      expect(couponProblem(once, context({ customerRedemptions: 0 }))).toBeNull();
    });
  });

  describe("eligibility", () => {
    it("restricts by account tier", () => {
      const tradeOnly = coupon({ allowedTiers: ["wholesale"] });
      expect(couponProblem(tradeOnly, context({ accountTier: "retail" }))).toMatch(/not valid for this account/);
      expect(couponProblem(tradeOnly, context({ accountTier: "wholesale" }))).toBeNull();
    });
    it("refuses to stack on contract pricing when it may not", () => {
      const single = coupon({ stackable: false });
      expect(couponProblem(single, context({ accountDiscount: 2_500 }))).toMatch(/cannot be combined/);
      expect(couponProblem(single, context({ accountDiscount: 0 }))).toBeNull();
    });
    it("keeps the minimum subtotal rule", () => {
      const big = coupon({ minSubtotal: 75_000 });
      expect(couponProblem(big, context({ eligibleBase: 74_999 }))).toMatch(/\$750\.00/);
      expect(couponProblem(big, context({ eligibleBase: 75_000 }))).toBeNull();
    });
  });

  it("reports the window before the usage limit so the buyer sees the real reason first", () => {
    const expired = coupon({ expiresAt: new Date("2026-01-01T00:00:00Z"), maxRedemptions: 1, redeemedCount: 1 });
    expect(couponProblem(expired, context())).toMatch(/expired/);
  });
});
