/**
 * Case weights are stored in whole ounces (KRG-6). A 0.6 lb carton used to round to 0 or 1 lb
 * as an integer pound, which threw the dimensional freight calculation off by a wide margin on
 * light goods. Everything a person sees or imports stays in pounds.
 */
export const OUNCES_PER_LB = 16;

/** Whole ounces → pounds, rounded to two decimals for display and export. */
export function ozToLbs(ounces: number): number {
  return Math.round((ounces / OUNCES_PER_LB) * 100) / 100;
}

/** Pounds (as typed or imported) → whole ounces for storage. */
export function lbsToOz(pounds: number): number {
  return Math.round(pounds * OUNCES_PER_LB);
}
