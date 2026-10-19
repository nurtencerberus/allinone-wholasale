import { describe, expect, it } from "vitest";
import { canSeePrices } from "@/lib/access";
import { hasPermission, isStaffRole } from "@/lib/staff";

describe("staff roles", () => {
  it("gives the owner every permission and customers none", () => {
    expect(hasPermission({ role: "admin" }, "staff")).toBe(true);
    expect(hasPermission({ role: "customer" }, "view")).toBe(false);
    expect(hasPermission(null, "view")).toBe(false);
  });

  it("separates duties", () => {
    expect(hasPermission({ role: "ops" }, "inventory")).toBe(true);
    expect(hasPermission({ role: "ops" }, "payments")).toBe(false);
    expect(hasPermission({ role: "accounting" }, "payments")).toBe(true);
    expect(hasPermission({ role: "accounting" }, "products")).toBe(false);
    expect(hasPermission({ role: "sales" }, "accounts")).toBe(true);
    expect(hasPermission({ role: "sales" }, "staff")).toBe(false);
    expect(hasPermission({ role: "viewer" }, "view")).toBe(true);
    expect(hasPermission({ role: "viewer" }, "orders")).toBe(false);
  });

  it("lets every staff role see prices", () => {
    expect(isStaffRole("viewer")).toBe(true);
    expect(canSeePrices({ role: "viewer", accountTier: "retail" })).toBe(true);
    expect(canSeePrices({ role: "customer", accountTier: "retail" })).toBe(false);
  });
});
