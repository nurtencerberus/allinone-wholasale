import { SITE, stateName } from "@/lib/site";
import { ozToLbs } from "@/lib/weight";

export type ShippingInputLine = {
  /** Case weight in whole ounces (KRG-6). */
  weightOz: number;
  dimensions: { l: number; w: number; h: number };
  cases: number;
  /** Hazardous material: no air service may be offered for the shipment (KRG-7). */
  hazmat?: boolean;
};

export type ShippingOption = {
  id: string;
  carrier: string;
  service: string;
  cost: number;
  transitDays: string;
  /** A ground / standard service: the only kind a freight coupon may waive. */
  ground: boolean;
  mode: "parcel" | "ltl";
  billableLbs: number;
  dimWeightLbs: number;
  note: string;
};

export type ShippingQuote = {
  options: ShippingOption[];
  billableLbs: number;
  dimWeightLbs: number;
  cartons: number;
  palletised: boolean;
  source: "easypost" | "dimensional_matrix" | "empty";
  zone: number;
  note: string;
};

const ZONE_BY_STATE: Record<string, number> = {
  NJ: 2, NY: 2, PA: 2, CT: 2, RI: 2, MA: 2, VT: 2, NH: 2, ME: 2, DE: 2, MD: 2, DC: 2,
  VA: 3, WV: 3, NC: 3, SC: 3, OH: 3,
  GA: 4, FL: 4, AL: 4, MS: 4, IN: 4, MI: 4, IL: 4, WI: 4, TN: 4, KY: 4,
  MN: 5, IA: 5, MO: 5, AR: 5, LA: 5, OK: 5,
  TX: 6, KS: 6, NE: 6, SD: 6, ND: 6, CO: 6,
  MT: 7, WY: 7, NM: 7, AZ: 7, UT: 7, ID: 7,
  CA: 8, OR: 8, WA: 8, NV: 8, AK: 8, HI: 8,
};

/** Dimensional weight divisor for UPS/FedEx domestic parcel (in³ per lb). */
const DIM_DIVISOR = 139;
/** Dunnage and the outer carton, added to every package — carriers bill per package. */
const PACKAGING_LBS_PER_CARTON = 0.4;

export function zoneFor(state: string): number {
  return ZONE_BY_STATE[(state || "").toUpperCase()] ?? 5;
}

export function dimensionalWeight(line: ShippingInputLine) {
  const cubic = line.dimensions.l * line.dimensions.w * line.dimensions.h;
  const dimLbs = cubic / DIM_DIVISOR;
  const actualLbs = ozToLbs(line.weightOz);
  return {
    dimLbs: dimLbs * line.cases,
    actualLbs: actualLbs * line.cases,
    cubic: cubic * line.cases,
    /** What the carrier bills for one carton of this line: the greater weight, plus packaging. */
    billablePerCarton: Math.max(actualLbs, dimLbs) + PACKAGING_LBS_PER_CARTON,
    actualPerCarton: actualLbs,
  };
}

export function summariseFreight(lines: ShippingInputLine[]) {
  const totals = lines.reduce(
    (acc, line) => {
      const dims = dimensionalWeight(line);
      acc.dimWeight += dims.dimLbs;
      acc.actualWeight += dims.actualLbs;
      acc.cubic += dims.cubic;
      acc.cartons += line.cases;
      // Billable weight is per carton, as the carrier bills it: taking the greater of the two
      // totals once would under-bill a mix of one heavy and many bulky cartons.
      acc.billable += dims.billablePerCarton * line.cases;
      acc.heaviest = Math.max(acc.heaviest, dims.actualPerCarton);
      acc.hazmat = acc.hazmat || Boolean(line.hazmat);
      return acc;
    },
    { dimWeight: 0, actualWeight: 0, cubic: 0, cartons: 0, billable: 0, heaviest: 0, hazmat: false },
  );

  const dimWeight = Math.round(totals.dimWeight * 10) / 10;
  const billableLbs = Math.round(totals.billable * 10) / 10;
  const palletised = billableLbs >= 150 || totals.heaviest >= 40 || totals.cubic > 12000;

  return { ...totals, dimWeightLbs: dimWeight, billableLbs, palletised };
}

function matrixOptions(input: {
  state: string;
  billableLbs: number;
  dimWeightLbs: number;
  cartons: number;
  palletised: boolean;
  hazmat: boolean;
}): ShippingOption[] {
  const zone = zoneFor(input.state);
  const lbs = Math.max(input.billableLbs, 1);
  const ground = Math.round(950 + zone * 150 + lbs * (32 + zone * 6));
  const air = Math.round(ground * 2.05 + 1650);
  const options: ShippingOption[] = [];

  if (input.palletised) {
    // An estimate, not a carrier quote: no class, NMFC or accessorial has been priced yet, and
    // the carrier is chosen when the shipment is booked (KRG-3 is a real LTL rate; this is not).
    const ltlBase = Math.max(18500, Math.round(11500 + zone * 900 + lbs * 20));
    const pallets = Math.max(1, Math.ceil(lbs / 1200));
    options.push({
      id: "ltl-freight",
      carrier: "LTL freight",
      service: "Curbside delivery · carrier assigned at booking",
      cost: ltlBase,
      transitDays: "4–7 business days (estimate)",
      ground: false,
      mode: "ltl",
      billableLbs: Math.round(lbs * 10) / 10,
      dimWeightLbs: input.dimWeightLbs,
      note: `Estimated LTL rate for ${pallets} pallet(s). Freight class, NMFC and any accessorial are confirmed when we book the shipment; we contact you before anything changes.`,
    });
    options.push({
      id: "ltl-freight-appointment",
      carrier: "LTL freight",
      service: "Inside delivery · appointment + liftgate",
      cost: Math.round(ltlBase * 1.22),
      transitDays: "5–8 business days (estimate)",
      ground: false,
      mode: "ltl",
      billableLbs: Math.round(lbs * 10) / 10,
      dimWeightLbs: input.dimWeightLbs,
      note: "Estimated rate including inside placement, a two-hour appointment window, call-ahead and liftgate. Confirmed when the shipment is booked.",
    });
    return options;
  }

  options.push({
    id: "ups-ground",
    carrier: "UPS",
    service: "Ground · dimensional rate",
    cost: ground,
    transitDays: `${Math.max(1, zone - 1)}–${zone + 1} business days (estimate)`,
    ground: true,
    mode: "parcel",
    billableLbs: Math.round(lbs * 10) / 10,
    dimWeightLbs: input.dimWeightLbs,
    note: `Estimated from billable weight (${lbs.toFixed(1)} lb) out of ${SITE.city}, ${SITE.state} · zone ${zone} · ${stateName(input.state)}. Transit time is the carrier's published range, not a guarantee.`,
  });

  // Hazardous material cannot move by air as ordinary parcel freight.
  if (!input.hazmat) {
    options.push({
      id: "ups-2day",
      carrier: "UPS",
      service: "2nd Day Air · dimensional rate",
      cost: air,
      transitDays: "2 business days (estimate)",
      ground: false,
      mode: "parcel",
      billableLbs: Math.round(lbs * 10) / 10,
      dimWeightLbs: input.dimWeightLbs,
      note: "Estimated air rate. Oversize cartons may be re-rated by the carrier at pickup.",
    });
  }

  return options;
}

async function easyPostOptions(input: {
  state: string;
  zip: string;
  city: string;
  billableLbs: number;
  hazmat: boolean;
  lines: ShippingInputLine[];
}): Promise<ShippingOption[] | null> {
  const key = process.env.EASYPOST_API_KEY;
  if (!key || input.zip.length < 5) return null;
  const heaviest = input.lines.reduce(
    (max, line) => {
      const cubic = line.dimensions.l * line.dimensions.w * line.dimensions.h;
      return {
        l: Math.max(max.l, line.dimensions.l),
        w: Math.max(max.w, line.dimensions.w),
        h: Math.min(70, max.h + line.dimensions.h),
        cubic: max.cubic + cubic,
      };
    },
    { l: 0, w: 0, h: 0, cubic: 0 },
  );

  try {
    const response = await fetch("https://api.easypost.com/v2/shipments", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shipment: {
          to_address: { country: "US", state: input.state, zip: input.zip, city: input.city },
          from_address: { country: "US", state: SITE.originState, zip: SITE.originZip, city: SITE.city },
          parcel: {
            weight: Math.max(1, Math.round(input.billableLbs * 16)),
            length: Math.max(6, heaviest.l),
            width: Math.max(6, heaviest.w),
            height: Math.max(6, heaviest.h),
          },
        },
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      rates?: { id: string; carrier: string; service: string; rate: string; delivery_days?: number }[];
    };
    if (!data.rates?.length) return null;

    const preferred = ["UPS", "FedEx", "USPS"];
    const rates = [...data.rates].sort((a, b) => {
      const rank = (carrier: string) => {
        const index = preferred.indexOf(carrier);
        return index === -1 ? 99 : index;
      };
      if (rank(a.carrier) !== rank(b.carrier)) return rank(a.carrier) - rank(b.carrier);
      return Number(a.rate) - Number(b.rate);
    });

    // Hazardous material never goes by air (KRG-7).
    const allowed = input.hazmat ? rates.filter((rate) => /ground|standard|home\s*delivery|surepost|parcel\s*select|freight/i.test(rate.service)) : rates;
    const unique = allowed.filter(
      (rate, index) => allowed.findIndex((other) => other.carrier === rate.carrier && other.service === rate.service) === index,
    );
    const picked = unique.slice(0, 3).map((rate, index) => ({
      // EasyPost issues new rate ids on every quote; carrier + service is stable across the
      // quote, payment and order calls, so the buyer's choice is matched, never swapped.
      id: `easypost-${rate.carrier}-${rate.service}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      carrier: rate.carrier,
      service: rate.service,
      cost: Math.round(Number(rate.rate) * 100),
      transitDays: rate.delivery_days ? `${rate.delivery_days} business days` : "3–5 business days",
      // Only a ground / standard / home-delivery service may be waived by a freight coupon.
      ground: /ground|standard|home\s*delivery|surepost|parcel\s*select/i.test(rate.service),
      mode: (input.billableLbs >= 150 ? "ltl" : "parcel") as "ltl" | "parcel",
      billableLbs: Math.round(input.billableLbs * 10) / 10,
      dimWeightLbs: 0,
      note: index === 0 ? "Live carrier rate via EasyPost · includes fuel surcharge." : "Live carrier rate via EasyPost.",
    }));
    return picked;
  } catch {
    return null;
  }
}

/**
 * KRG-4: the free-freight allowance is applied in one place, to whatever options were quoted —
 * live rates included — and only to a ground parcel service inside the covered zones. It is
 * never applied to an air upgrade or to LTL.
 */
export const FREE_FREIGHT_MAX_ZONE = SITE.freeFreightMaxZone;

export function applyFreightAllowance(
  options: ShippingOption[],
  subtotal: number,
  zone: number,
  palletised: boolean,
): ShippingOption[] {
  const earned = !palletised && subtotal >= SITE.freeFreightThreshold && zone <= FREE_FREIGHT_MAX_ZONE;
  if (!earned) return options;
  return options.map((option) =>
    option.ground && option.mode === "parcel"
      ? {
          ...option,
          cost: 0,
          note: `Freight allowance applied — orders over $${(SITE.freeFreightThreshold / 100).toFixed(0)} ship free on ground to zones 1–${FREE_FREIGHT_MAX_ZONE}.`,
        }
      : option,
  );
}

export async function quoteShipping(input: {
  state: string;
  zip: string;
  city?: string;
  subtotal: number;
  lines: ShippingInputLine[];
}): Promise<ShippingQuote> {
  if (!input.lines.length || !input.state || !input.zip) {
    return {
      options: [],
      billableLbs: 0,
      dimWeightLbs: 0,
      cartons: 0,
      palletised: false,
      source: "empty",
      zone: zoneFor(input.state),
      note: "Enter a delivery address to price dimensional freight.",
    };
  }

  const summary = summariseFreight(input.lines);
  const live = await easyPostOptions({
    state: input.state,
    zip: input.zip,
    city: input.city || "",
    billableLbs: summary.billableLbs,
    hazmat: summary.hazmat,
    lines: input.lines,
  });

  if (live) {
    if (summary.palletised) {
      const ltl = matrixOptions({
        state: input.state,
        billableLbs: summary.billableLbs,
        dimWeightLbs: summary.dimWeightLbs,
        cartons: summary.cartons,
        palletised: true,
        hazmat: summary.hazmat,
      }).find((option) => option.mode === "ltl");
      if (ltl) live.push(ltl);
    }
    return {
      options: applyFreightAllowance(live, input.subtotal, zoneFor(input.state), summary.palletised),
      billableLbs: summary.billableLbs,
      dimWeightLbs: summary.dimWeightLbs,
      cartons: summary.cartons,
      palletised: summary.palletised,
      source: "easypost",
      zone: zoneFor(input.state),
      note: "Rates priced live against the carrier network using dimensional weight.",
    };
  }

  return {
    options: applyFreightAllowance(
      matrixOptions({
        state: input.state,
        billableLbs: summary.billableLbs,
        dimWeightLbs: summary.dimWeightLbs,
        cartons: summary.cartons,
        palletised: summary.palletised,
        hazmat: summary.hazmat,
      }),
      input.subtotal,
      zoneFor(input.state),
      summary.palletised,
    ),
    billableLbs: summary.billableLbs,
    dimWeightLbs: summary.dimWeightLbs,
    cartons: summary.cartons,
    palletised: summary.palletised,
    source: "dimensional_matrix",
    zone: zoneFor(input.state),
    note: "Priced with the Ciputra dimensional freight matrix (billable weight = greater of actual and dim weight, dim divisor 139).",
  };
}
