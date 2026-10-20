import { describe, expect, it } from "vitest";
import { cleanCartItems, mergeCartItems } from "@/lib/cart-store";
import { MAX_CASES_PER_LINE } from "@/lib/checkout";

describe("cleanCartItems", () => {
  it("merges duplicate lines and keeps whole cases", () => {
    expect(cleanCartItems([{ productId: 4, cases: 2 }, { productId: 4, cases: 1.2 }])).toEqual([
      { productId: 4, cases: 4 },
    ]);
  });
  it("drops anything that is not a real line", () => {
    const items = [
      { productId: 0, cases: 3 },
      { productId: 7, cases: 0 },
      { productId: 7, cases: -2 },
      { productId: 1.5, cases: 1 },
    ] as { productId: number; cases: number }[];
    expect(cleanCartItems(items)).toEqual([]);
  });
  it("caps a line at the per-line ceiling", () => {
    expect(cleanCartItems([{ productId: 2, cases: 5_000 }])).toEqual([
      { productId: 2, cases: MAX_CASES_PER_LINE },
    ]);
  });
});

describe("mergeCartItems", () => {
  it("takes the larger quantity of a line both carts hold, never the sum", () => {
    const merged = mergeCartItems([{ productId: 1, cases: 4 }], [{ productId: 1, cases: 2 }]);
    expect(merged).toEqual([{ productId: 1, cases: 4 }]);
  });
  it("keeps lines only one side has", () => {
    const merged = mergeCartItems([{ productId: 1, cases: 1 }], [{ productId: 2, cases: 3 }]);
    expect(merged).toEqual([{ productId: 1, cases: 1 }, { productId: 2, cases: 3 }]);
  });
  it("is idempotent: merging the same cart twice changes nothing", () => {
    const cart = [{ productId: 9, cases: 6 }, { productId: 3, cases: 2 }];
    const once = mergeCartItems(cart, cart);
    expect(mergeCartItems(once, cart)).toEqual(once);
  });
  it("handles an empty side", () => {
    expect(mergeCartItems([], [{ productId: 5, cases: 2 }])).toEqual([{ productId: 5, cases: 2 }]);
    expect(mergeCartItems([{ productId: 5, cases: 2 }], [])).toEqual([{ productId: 5, cases: 2 }]);
  });
});
