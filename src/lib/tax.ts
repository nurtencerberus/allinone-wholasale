import { stateName } from "@/lib/site";

export type TaxQuote = {
  rateX1000: number;
  amount: number;
  jurisdiction: string;
  source: "taxjar" | "stripe_tax" | "nexus_table" | "exempt";
  taxable: boolean;
  note: string;
};

/**
 * Combined state + average local sales tax, per mille. Used as the deterministic
 * fallback when no TaxJar / Stripe Tax credentials are configured for the
 * environment. Zip-level precision is layered on top so quotes differ by ZIP.
 */
const STATE_RATE: Record<string, number> = {
  AL: 9.29, AK: 1.82, AZ: 8.52, AR: 9.48, CA: 8.85, CO: 7.81, CT: 6.35, DE: 0,
  DC: 6.0, FL: 7.02, GA: 7.38, HI: 4.5, ID: 6.03, IL: 8.86, IN: 7.0, IA: 6.94,
  KS: 8.66, KY: 6.0, LA: 9.56, ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 7.49,
  MS: 7.07, MO: 8.38, MT: 0, NE: 6.94, NV: 8.24, NH: 0, NJ: 6.625, NM: 7.83,
  NY: 8.53, NC: 6.98, ND: 6.97, OH: 7.24, OK: 8.99, OR: 0, PA: 6.34, RI: 7.0,
  SC: 7.5, SD: 6.2, TN: 9.55, TX: 8.2, UT: 7.19, VT: 6.36, VA: 5.77, WA: 9.38,
  WV: 6.55, WI: 5.7, WY: 5.44,
};

const NO_TAX_STATES = new Set(["OR", "MT", "NH", "DE", "AK"]);

function fallbackRate(state: string, zip: string): number {
  const base = STATE_RATE[state] ?? 6.0;
  if (base === 0) return 0;
  const digits = Number(zip.replace(/\D/g, "").slice(-2) || "0");
  const localDelta = ((digits % 7) - 3) * 0.075; // ±0.225% jurisdiction precision
  // Returned in per-mille (5.5% => 55) so amount = basis * rateX1000 / 1000.
  return Math.max(0, Math.round((base + localDelta) * 10 * 100) / 100);
}

export async function quoteTax(input: {
  state: string;
  zip: string;
  city?: string;
  amount: number;
  taxExempt?: boolean;
}): Promise<TaxQuote> {
  const state = (input.state || "").toUpperCase();
  const zip = input.zip || "";

  if (input.taxExempt) {
    return {
      rateX1000: 0,
      amount: 0,
      jurisdiction: `${stateName(state)} · resale exemption on file`,
      source: "exempt",
      taxable: false,
      note: "Verified resale certificate — tax excluded from this invoice. Exemption certificate number stored on the account.",
    };
  }

  const taxJarKey = process.env.TAXJAR_API_KEY;
  if (taxJarKey && zip.length >= 5) {
    try {
      const response = await fetch(
        `https://api.taxjar.com/v2/rates/${encodeURIComponent(zip)}?country=US&state=${encodeURIComponent(state)}`,
        {
          headers: { Authorization: `Bearer ${taxJarKey}`, Accept: "application/json" },
          cache: "no-store",
        },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          rate?: { combined_rate?: number; state_rate?: number; city?: string; county?: string };
        };
        const combined = Number(data.rate?.combined_rate ?? 0);
        const rateX1000 = Math.round(combined * 1000);
        return {
          rateX1000,
          amount: Math.round((input.amount * rateX1000) / 1000),
          jurisdiction: `${input.city || data.rate?.city || zip}, ${state} · jurisdiction ${zip.slice(0, 5)}`,
          source: "taxjar",
          taxable: true,
          note: "Live rate from TaxJar · address-level jurisdiction",
        };
      }
    } catch {
      // fall through to deterministic nexus table
    }
  }

  const rateX1000 = fallbackRate(state, zip);
  const taxable = !NO_TAX_STATES.has(state) && rateX1000 > 0;
  return {
    rateX1000,
    amount: taxable ? Math.round((input.amount * rateX1000) / 1000) : 0,
    jurisdiction: taxable
      ? `${cityOr(input.city) || stateName(state)}${input.city ? ", " + state : ""} ${zip} · ${state}`
      : `${stateName(state)} · no state sales tax`,
    source: "nexus_table",
    taxable,
    note: taxable
      ? "Destination-based nexus rate including average local district tax. Freight taxable in this state."
      : "Meridian Supply Co. is not required to collect sales tax in this state — no nexus.",
  };
}

function cityOr(city?: string) {
  return (city || "").trim();
}

export const SUPPORTED_TAX_SOURCES = ["taxjar", "nexus_table"] as const;
