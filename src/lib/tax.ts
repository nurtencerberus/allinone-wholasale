import { stateName } from "@/lib/site";

/**
 * Sales tax, destination-based, collected only where the business is registered.
 *
 * Registration (nexus) today: New Jersey only. In every other state we collect nothing —
 * collecting tax we are not registered to remit is itself a liability. When the business
 * registers in another state, add it to NEXUS here with its rules, ideally via a tax API.
 *
 * New Jersey (Division of Taxation bulletins S&U-4 and TB-70):
 *  - 6.625% statewide; no local add-on rates.
 *  - Food and food ingredients and dietary supplements (products carrying a Supplement
 *    Facts label) are exempt; candy and soft drinks are taxable.
 *  - Delivery charges are taxable in proportion to the taxable goods on the order
 *    (allocated by price).
 * Confirm product classes and any UEZ reduced-rate eligibility with the accountant.
 */

export const TAX_CLASSES = ["general", "food", "supplement", "candy"] as const;
export type TaxClass = (typeof TAX_CLASSES)[number];

type StateRule = { ratePercent: number; exempt: ReadonlySet<TaxClass> };

const NEXUS: Record<string, StateRule> = {
  NJ: { ratePercent: 6.625, exempt: new Set<TaxClass>(["food", "supplement"]) },
};

export const NEXUS_STATES = Object.keys(NEXUS);

export function isTaxClass(value: unknown): value is TaxClass {
  return TAX_CLASSES.includes(value as TaxClass);
}

/** Default class for a catalog category; admins can override per product. */
export function defaultTaxClass(category: string): TaxClass {
  if (category === "supplements") return "supplement";
  if (category === "pantry") return "food";
  return "general";
}

export type TaxQuote = {
  /** Per mille: 66.25 = 6.625%. */
  rateX1000: number;
  amount: number;
  /** Goods + freight the rate was applied to, in cents. */
  taxableAmount: number;
  jurisdiction: string;
  source: "state_rate" | "exempt" | "no_nexus";
  taxable: boolean;
  note: string;
};

export type TaxExemption = {
  taxExempt: boolean;
  taxExemptState: string | null;
  taxExemptCertNumber: string | null;
  taxExemptExpires: Date | string | null;
};

/** A resale exemption counts only for its own state, with a certificate on file, before expiry. */
export function exemptionApplies(exemption: TaxExemption | null | undefined, state: string): boolean {
  if (!exemption?.taxExempt || !exemption.taxExemptCertNumber?.trim()) return false;
  if ((exemption.taxExemptState ?? "").toUpperCase() !== state.toUpperCase()) return false;
  if (exemption.taxExemptExpires && new Date(exemption.taxExemptExpires).getTime() <= Date.now()) return false;
  return true;
}

export type TaxLine = { amount: number; taxClass: string };

export function quoteTax(input: {
  state: string;
  /** Goods after every discount, per tax class. */
  lines: TaxLine[];
  shipping: number;
  exemption?: TaxExemption | null;
}): TaxQuote {
  const state = (input.state || "").toUpperCase();
  const rule = NEXUS[state];

  if (!rule) {
    return {
      rateX1000: 0,
      amount: 0,
      taxableAmount: 0,
      jurisdiction: `${stateName(state)} · not collected`,
      source: "no_nexus",
      taxable: false,
      note: "We are not registered to collect sales tax in this state. Your business may owe use tax directly.",
    };
  }

  if (exemptionApplies(input.exemption, state)) {
    return {
      rateX1000: 0,
      amount: 0,
      taxableAmount: 0,
      jurisdiction: `${stateName(state)} · resale certificate on file`,
      source: "exempt",
      taxable: false,
      note: `Resale exemption applied for deliveries in ${stateName(state)}.`,
    };
  }

  const goods = input.lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
  const taxableGoods = input.lines
    .filter((line) => !rule.exempt.has(line.taxClass as TaxClass))
    .reduce((sum, line) => sum + Math.max(0, line.amount), 0);
  const taxableShipping = goods > 0 ? Math.round((Math.max(0, input.shipping) * taxableGoods) / goods) : 0;
  const taxableAmount = taxableGoods + taxableShipping;
  const rateX1000 = rule.ratePercent * 10;
  const amount = Math.round((taxableAmount * rateX1000) / 1000);

  return {
    rateX1000,
    amount,
    taxableAmount,
    jurisdiction: `${stateName(state)} · ${rule.ratePercent}% statewide`,
    source: "state_rate",
    taxable: amount > 0,
    note:
      taxableGoods === goods
        ? `All items on this order are taxable in ${stateName(state)}, including freight.`
        : taxableGoods === 0
          ? `Food and dietary supplements are exempt in ${stateName(state)}, and so is freight on them.`
          : `Food and dietary supplements are exempt in ${stateName(state)}; tax applies to the other items and their share of freight.`,
  };
}
