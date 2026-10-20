import { describe, expect, it } from "vitest";
import { canManageCompany, canOrderForCompany, COMPANY_ROLES, isCompanyRole } from "@/lib/companies";

const member = (companyId: number | null, companyRole: string | null) => ({ companyId, companyRole });

describe("company roles", () => {
  it("knows the roles it accepts", () => {
    expect(COMPANY_ROLES).toEqual(["owner", "buyer", "viewer"]);
    expect(isCompanyRole("owner")).toBe(true);
    expect(isCompanyRole("admin")).toBe(false);
    expect(isCompanyRole(null)).toBe(false);
  });
});

describe("who may manage the account", () => {
  it("only an owner", () => {
    expect(canManageCompany(member(1, "owner"))).toBe(true);
    expect(canManageCompany(member(1, "buyer"))).toBe(false);
    expect(canManageCompany(member(1, "viewer"))).toBe(false);
  });
  it("nobody without a company", () => {
    expect(canManageCompany(member(null, "owner"))).toBe(false);
    expect(canManageCompany(null)).toBe(false);
  });
});

describe("who may order", () => {
  it("owners and buyers may, viewers may not", () => {
    expect(canOrderForCompany(member(1, "owner"))).toBe(true);
    expect(canOrderForCompany(member(1, "buyer"))).toBe(true);
    expect(canOrderForCompany(member(1, "viewer"))).toBe(false);
  });
  it("a single-person account always may", () => {
    expect(canOrderForCompany(member(null, null))).toBe(true);
    expect(canOrderForCompany(null)).toBe(true);
  });
});
