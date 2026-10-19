// Client-safe product identity and compliance helpers (no database imports).

/** Digits only; GTIN-8, UPC-A (12), EAN-13 and GTIN-14 are accepted. */
export function normaliseGtin(value: unknown): string {
  return String(value ?? "").replace(/[\s-]/g, "");
}

/** GS1 mod-10 check digit. */
export function isValidGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits
    .reverse()
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function normaliseAsin(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Amazon ASIN (B0 + 8) or a 10-character ISBN used as an ASIN for books. */
export function isValidAsin(value: string): boolean {
  return /^B0[0-9A-Z]{8}$/.test(value) || /^\d{9}[\dX]$/.test(value);
}

/** The comparison link is always derived from the ASIN — never an arbitrary stored URL. */
export function amazonUrl(asin: string | null | undefined): string | null {
  const clean = normaliseAsin(asin);
  return clean && isValidAsin(clean) ? `https://www.amazon.com/dp/${clean}` : null;
}

/** FALCPA major food allergens (sesame added by the FASTER Act, 2023). */
export const ALLERGENS = [
  "milk",
  "eggs",
  "fish",
  "crustacean shellfish",
  "tree nuts",
  "peanuts",
  "wheat",
  "soybeans",
  "sesame",
] as const;

/** NMFC freight classes. */
export const FREIGHT_CLASSES = [
  "50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500",
] as const;

/** 21 CFR 101.93(c) — required next to structure/function claims on dietary supplements. */
export const FDA_DISCLAIMER =
  "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.";

/** English name for an ISO 3166-1 alpha-2 code, or null if the code is not a region. */
export function regionName(code: string | null | undefined): string | null {
  const clean = String(code ?? "").trim().toUpperCase();
  // ISO 3166 user-assigned codes (AA, QM–QZ, XA–XZ, ZZ) are not countries.
  if (!/^[A-Z]{2}$/.test(clean) || /^(AA|Q[M-Z]|X[A-Z]|ZZ)$/.test(clean)) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(clean);
    return name && name !== clean ? name : null;
  } catch {
    return null;
  }
}
