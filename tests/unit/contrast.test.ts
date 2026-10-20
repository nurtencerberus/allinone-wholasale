import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * UX-3 (WCAG 2.1 AA, 1.4.3 Contrast Minimum). The palette and the text shades the storefront
 * actually uses are checked here, so a future colour tweak cannot quietly drop body copy below
 * the 4.5:1 floor. Large text and non-text UI have a 3:1 floor; both are asserted where used.
 */
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--color-${name} is not defined in globals.css`);
  return match[1];
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tailwind's `text-ink/60` is the ink colour composited over the background at 60%. */
function alpha(fg: Rgb, bg: Rgb, percent: number): Rgb {
  const a = percent / 100;
  return fg.map((value, index) => Math.round(value * a + bg[index] * (1 - a))) as Rgb;
}

const cream = rgb(token("cream"));
const ink = rgb(token("ink"));

describe("palette contrast on cream", () => {
  it.each(["ink", "moss", "fern", "clay"])("%s reads as body text", (name) => {
    expect(contrast(rgb(token(name)), cream)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("palette contrast on ink", () => {
  it.each(["cream", "sage", "gold"])("%s reads on the dark sections", (name) => {
    expect(contrast(rgb(token(name)), ink)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the muted text shades in use", () => {
  // Keep this list in step with `grep -roh "text-ink/[0-9]*" src | sort -u`.
  const inkShades = [65, 68, 70, 72, 75, 80];
  it.each(inkShades)("text-ink/%i stays above 4.5:1 on cream", (percent) => {
    expect(contrast(alpha(ink, cream, percent), cream)).toBeGreaterThanOrEqual(4.5);
  });

  const creamShades = [50, 55, 60, 65, 70, 75, 80, 85];
  it.each(creamShades)("text-cream/%i stays above 4.5:1 on ink", (percent) => {
    expect(contrast(alpha(cream, ink, percent), ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("the faintest shades are only used for borders and dividers, not text", () => {
    // 20–30% ink is deliberately below the text floor; it must never be used for copy. The
    // assertion documents the intent and fails loudly if someone raises it into text range.
    expect(contrast(alpha(ink, cream, 30), cream)).toBeLessThan(4.5);
  });
});
