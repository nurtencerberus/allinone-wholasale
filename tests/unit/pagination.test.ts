import { describe, expect, it } from "vitest";
import { pageRange, pageWindow } from "@/lib/pagination";

describe("pageWindow", () => {
  it("returns the single page when there is nothing to page through", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 0)).toEqual([1]);
  });

  it("lists every page while they fit", () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the first and last page and gaps the rest", () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it("does not gap a run of one", () => {
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("clamps a current page outside the range", () => {
    expect(pageWindow(99, 5)).toEqual([1, null, 4, 5]);
    expect(pageWindow(-4, 5)).toEqual([1, 2, null, 5]);
  });
});

describe("pageRange", () => {
  it("counts from one", () => {
    expect(pageRange(1, 24, 312)).toEqual({ from: 1, to: 24 });
    expect(pageRange(2, 24, 312)).toEqual({ from: 25, to: 48 });
  });

  it("stops at the total on the last page", () => {
    expect(pageRange(13, 24, 300)).toEqual({ from: 289, to: 300 });
  });

  it("has nothing to show when nothing matched", () => {
    expect(pageRange(1, 24, 0)).toEqual({ from: 0, to: 0 });
  });
});
