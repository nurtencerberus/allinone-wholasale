import { US_STATES } from "@/lib/site";

/** We deliver to the contiguous 48 states and DC only (no AK, HI, territories or APO/FPO/DPO). */
const EXCLUDED_STATES = new Set(["AK", "HI"]);

export const SERVICE_STATES = US_STATES.filter((state) => !EXCLUDED_STATES.has(state.code));

/**
 * First three ZIP digits by state (USPS sectional centers), lower 48 + DC. Ranges are kept
 * slightly wide so unassigned prefixes inside a state's block are not rejected; no prefix
 * belongs to two states.
 */
const ZIP3_RANGES: Record<string, [number, number][]> = {
  AL: [[350, 369]], AZ: [[850, 865]], AR: [[716, 729]], CA: [[900, 961]], CO: [[800, 816]],
  CT: [[60, 69]], DE: [[197, 199]], DC: [[200, 200], [202, 205], [569, 569]],
  FL: [[320, 339], [341, 349]], GA: [[300, 319], [398, 399]], ID: [[832, 838]], IL: [[600, 629]],
  IN: [[460, 479]], IA: [[500, 528]], KS: [[660, 679]], KY: [[400, 427]], LA: [[700, 714]],
  ME: [[39, 49]], MD: [[206, 219]], MA: [[10, 27], [55, 55]], MI: [[480, 499]], MN: [[550, 567]],
  MS: [[386, 397]], MO: [[630, 658]], MT: [[590, 599]], NE: [[680, 693]], NV: [[889, 898]],
  NH: [[30, 38]], NJ: [[70, 89]], NM: [[870, 884]], NY: [[5, 5], [100, 149]], NC: [[270, 289]],
  ND: [[580, 588]], OH: [[430, 459]], OK: [[730, 732], [734, 749]], OR: [[970, 979]], PA: [[150, 196]],
  RI: [[28, 29]], SC: [[290, 299]], SD: [[570, 577]], TN: [[370, 385]],
  TX: [[733, 733], [750, 799], [885, 885]], UT: [[840, 847]], VT: [[50, 54], [56, 59]],
  VA: [[201, 201], [220, 246]], WA: [[980, 994]], WV: [[247, 268]], WI: [[530, 549]], WY: [[820, 831]],
};

/** Individual ZIPs served from another state's prefix block. */
const ZIP_EXCEPTIONS: Record<string, string> = {
  "06390": "NY", // Fishers Island
  "83414": "WY", // Alta
};

export function stateForZip(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  if (ZIP_EXCEPTIONS[zip]) return ZIP_EXCEPTIONS[zip];
  const prefix = Number(zip.slice(0, 3));
  for (const [state, ranges] of Object.entries(ZIP3_RANGES)) {
    if (ranges.some(([from, to]) => prefix >= from && prefix <= to)) return state;
  }
  return null;
}

const PO_BOX = /\b(p\.?\s*o\.?\s*b(ox)?|post\s+office\s+box|postal\s+box|lock\s*box)\b|^\s*box\s+\d+/i;

export type ShipToInput = { line1?: string; line2?: string; city?: string; state?: string; zip?: string };

/**
 * Returns a customer-facing reason the address cannot be served, or null when it can.
 * The ZIP decides the state: tax and freight are never priced on a state the ZIP contradicts.
 */
export function shipToProblem(address: ShipToInput): string | null {
  const state = (address.state ?? "").trim().toUpperCase();
  const zip = (address.zip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) return "Delivery ZIP must be 5 digits.";
  if (!state) return "Select the delivery state.";
  if (EXCLUDED_STATES.has(state) || !ZIP3_RANGES[state]) {
    return "We deliver to the contiguous 48 states and Washington, DC only.";
  }
  const zipState = stateForZip(zip);
  if (!zipState) return "We deliver to the contiguous 48 states and Washington, DC only.";
  if (zipState !== state) return `ZIP ${zip} is in ${zipState}, not ${state}. Check the delivery address.`;
  if (PO_BOX.test(address.line1 ?? "") || PO_BOX.test(address.line2 ?? "")) {
    return "Freight cannot be delivered to a PO Box. Enter a street address with a receiving location.";
  }
  return null;
}
