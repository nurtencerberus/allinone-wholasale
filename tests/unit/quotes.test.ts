import { describe, expect, it } from "vitest";
import { canTransition, cleanQuoteLines, QUOTE_TRANSITIONS } from "@/lib/quotes";
import { MAX_QUOTE_LINES } from "@/lib/quotes-view";

describe("cleanQuoteLines", () => {
  it("merges duplicate products and rounds up part cases", () => {
    expect(cleanQuoteLines([{ productId: 3, cases: 2 }, { productId: 3, cases: 1.2 }])).toEqual([
      { productId: 3, cases: 4, note: null },
    ]);
  });
  it("drops lines that are not a product and a positive quantity", () => {
    const lines = [
      { productId: 0, cases: 5 },
      { productId: 4, cases: 0 },
      { productId: 4, cases: -3 },
    ];
    expect(cleanQuoteLines(lines)).toEqual([]);
  });
  it("caps the request so the desk can price it by hand", () => {
    const many = Array.from({ length: MAX_QUOTE_LINES + 10 }, (_, index) => ({ productId: index + 1, cases: 1 }));
    expect(cleanQuoteLines(many)).toHaveLength(MAX_QUOTE_LINES);
  });
  it("keeps the buyer's note, trimmed", () => {
    expect(cleanQuoteLines([{ productId: 2, cases: 1, note: "  ship in two drops  " }])[0].note).toBe("ship in two drops");
  });
});

describe("the quote lifecycle", () => {
  it("lets the desk price a request and the buyer accept it", () => {
    expect(canTransition("requested", "quoted")).toBe(true);
    expect(canTransition("quoted", "accepted")).toBe(true);
  });
  it("refuses to price something already decided", () => {
    for (const status of ["accepted", "declined", "expired", "withdrawn"]) {
      expect(canTransition(status, "quoted")).toBe(false);
    }
  });
  it("never reopens a decided quote", () => {
    for (const status of ["accepted", "declined", "expired", "withdrawn"]) {
      expect(QUOTE_TRANSITIONS[status as keyof typeof QUOTE_TRANSITIONS]).toEqual([]);
    }
  });
  it("cannot accept a request that was never priced", () => {
    expect(canTransition("requested", "accepted")).toBe(false);
  });
  it("only expires a quote that is out with the buyer", () => {
    expect(canTransition("quoted", "expired")).toBe(true);
    expect(canTransition("requested", "expired")).toBe(false);
  });
});
