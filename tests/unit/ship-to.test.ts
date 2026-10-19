import { describe, expect, it } from "vitest";
import { SERVICE_STATES, shipToProblem, stateForZip } from "@/lib/ship-to";

describe("stateForZip", () => {
  it.each([
    ["07503", "NJ"], ["10001", "NY"], ["73301", "TX"], ["73101", "OK"], ["20500", "DC"], ["94105", "CA"],
    ["02108", "MA"], ["05401", "VT"], ["82001", "WY"], ["06390", "NY"], ["83414", "WY"],
  ])("%s → %s", (zip, state) => expect(stateForZip(zip)).toBe(state));

  it.each(["99501", "96813", "00901", "09001", "34001"])("%s is outside the service area", (zip) =>
    expect(stateForZip(zip)).toBeNull(),
  );

  it("never maps one prefix to two states", async () => {
    const counts = new Map<string, number>();
    for (let prefix = 0; prefix < 1000; prefix += 1) {
      const state = stateForZip(`${String(prefix).padStart(3, "0")}01`);
      if (state) counts.set(String(prefix), (counts.get(String(prefix)) ?? 0) + 1);
    }
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });
});

describe("shipToProblem", () => {
  const ok = { line1: "238 Lindbergh Pl", state: "NJ", zip: "07503" };
  it("accepts a lower-48 street address", () => expect(shipToProblem(ok)).toBeNull());
  it("rejects Alaska and Hawaii", () => {
    expect(shipToProblem({ ...ok, state: "AK", zip: "99501" })).toMatch(/contiguous 48/);
    expect(shipToProblem({ ...ok, state: "HI", zip: "96813" })).toMatch(/contiguous 48/);
  });
  it("rejects a state the ZIP contradicts", () => expect(shipToProblem({ ...ok, state: "DE" })).toMatch(/is in NJ/));
  it.each(["PO Box 12", "P.O. Box 12", "Post Office Box 12", "Box 44"])("rejects %s", (line1) =>
    expect(shipToProblem({ ...ok, line1 })).toMatch(/PO Box/),
  );
  it("does not treat a street containing 'box' as a PO Box", () =>
    expect(shipToProblem({ ...ok, line1: "12 Boxwood Ln" })).toBeNull());
  it("offers 49 states (48 + DC)", () => expect(SERVICE_STATES).toHaveLength(49));
});
