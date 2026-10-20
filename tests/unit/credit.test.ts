import { describe, expect, it } from "vitest";
import { agingBucket, creditVerdict, dueDateFor, type CreditPosition } from "@/lib/credit";

const position = (over: Partial<CreditPosition> = {}): CreditPosition => ({
  creditLimit: 500_000,
  paymentTermsDays: 30,
  creditHold: false,
  openBalance: 0,
  overdue: 0,
  oldestDueAt: null,
  available: 500_000,
  ...over,
});

describe("creditVerdict", () => {
  it("lets an order through inside the limit", () => {
    expect(creditVerdict(position({ openBalance: 100_000 }), 200_000).ok).toBe(true);
  });
  it("allows an order that lands exactly on the limit", () => {
    expect(creditVerdict(position({ openBalance: 300_000 }), 200_000).ok).toBe(true);
  });
  it("refuses the order that would cross it, and says what is left", () => {
    const verdict = creditVerdict(position({ openBalance: 400_000, available: 100_000 }), 200_000);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/\$1,000\.00 is available/);
  });
  it("refuses an account with no limit at all", () => {
    expect(creditVerdict(position({ creditLimit: 0 }), 1_000)).toMatchObject({ ok: false });
  });
  it("refuses while anything is past due, even well inside the limit", () => {
    const verdict = creditVerdict(position({ openBalance: 10_000, overdue: 10_000 }), 1_000);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/past due/);
  });
  it("refuses an account on hold first of all", () => {
    const verdict = creditVerdict(position({ creditHold: true, overdue: 50_000 }), 1_000);
    expect(verdict.reason).toMatch(/credit hold/);
  });
});

describe("dueDateFor", () => {
  const from = new Date("2026-03-01T00:00:00Z");
  it("adds the account's terms", () => {
    expect(dueDateFor(30, from).toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(dueDateFor(45, from).toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });
  it("falls back to 30 days on nonsense and caps at 180", () => {
    expect(dueDateFor(0, from).toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(dueDateFor(9_999, from).toISOString()).toBe(dueDateFor(180, from).toISOString());
  });
});

describe("agingBucket", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  it.each([
    [null, "current"],
    ["2026-07-15T00:00:00Z", "current"],
    ["2026-06-20T00:00:00Z", "1-30"],
    ["2026-05-20T00:00:00Z", "31-60"],
    ["2026-04-20T00:00:00Z", "61-90"],
    ["2026-01-20T00:00:00Z", "90+"],
  ])("%s → %s", (due, bucket) => {
    expect(agingBucket(due ? new Date(due) : null, now)).toBe(bucket);
  });
});
