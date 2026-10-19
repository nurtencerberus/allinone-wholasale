import { SITE, stateName } from "@/lib/site";

export type ShippingInputLine = {
  weightLbs: number;
  dimensions: { l: number; w: number; h: number };
  cases: number;
};

export type ShippingOption = {
  id: string;
  carrier: string;
  service: string;
  cost: number;
  transitDays: string;
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
const PACKAGING_LBS = 1.5;

export function zoneFor(state: string): number {
  return ZONE_BY_STATE[(state || "").toUpperCase()] ?? 5;
}

export function dimensionalWeight(line: ShippingInputLine) {
  const cubic = line.dimensions.l * line.dimensions.w * line.dimensions.h;
  const dimLbs = cubic / DIM_DIVISOR;
  return {
    dimLbs: dimLbs * line.cases,
    actualLbs: line.weightLbs * line.cases,
    cubic: cubic * line.cases,
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
      acc.heaviest = Math.max(acc.heaviest, line.weightLbs);
      return acc;
    },
    { dimWeight: 0, actualWeight: 0, cubic: 0, cartons: 0, heaviest: 0 },
  );

  const dimWeight = Math.round(totals.dimWeight * 10) / 10;
  const billable = Math.max(totals.actualWeight, totals.dimWeight) + PACKAGING_LBS;
  const billableLbs = Math.round(billable * 10) / 10;
  const palletised = billableLbs >= 150 || totals.heaviest >= 40 || totals.cubic > 12000;

  return { ...totals, dimWeightLbs: dimWeight, billableLbs, palletised };
}

function matrixOptions(input: {
  state: string;
  subtotal: number;
  billableLbs: number;
  dimWeightLbs: number;
  cartons: number;
  palletised: boolean;
}): ShippingOption[] {
  const zone = zoneFor(input.state);
  const lbs = Math.max(input.billableLbs, 1);
  const ground = Math.round(950 + zone * 150 + lbs * (32 + zone * 6));
  const air = Math.round(ground * 2.05 + 1650);
  const options: ShippingOption[] = [];
  const allowance = !input.palletised && input.subtotal >= SITE.freeFreightThreshold && zone <= 6;

  if (input.palletised) {
    const ltlBase = Math.max(18500, Math.round(11500 + zone * 900 + lbs * 20));
    options.push({
      id: "ltl-freight",
      carrier: "Ciputra Freight (LTL)",
      service: "Curbside LTL · pallet build",
      cost: ltlBase,
      transitDays: "4–7 business days",
      mode: "ltl",
      billableLbs: Math.round(lbs * 10) / 10,
      dimWeightLbs: input.dimWeightLbs,
      note: `LTL freight class 100 · ${Math.max(1, Math.ceil(lbs / 1200))} pallet(s) · liftgate included · appointment scheduled by carrier.`,
    });
    options.push({
      id: "ltl-freight-appointment",
      carrier: "Ciputra Freight (LTL)",
      service: "Inside delivery · appointment + liftgate",
      cost: Math.round(ltlBase * 1.22),
      transitDays: "5–8 business days",
      mode: "ltl",
      billableLbs: Math.round(lbs * 10) / 10,
      dimWeightLbs: input.dimWeightLbs,
      note: "Inside placement to your receiving area. Two-hour appointment window, call-ahead and liftgate included.",
    });
    return options;
  }

  options.push({
    id: "ups-ground",
    carrier: "UPS",
    service: "Ground · dimensional rate",
    cost: allowance ? 0 : ground,
    transitDays: `${Math.max(1, zone - 1)}–${zone + 1} business days`,
    mode: "parcel",
    billableLbs: Math.round(lbs * 10) / 10,
    dimWeightLbs: input.dimWeightLbs,
    note: allowance
      ? "Freight allowance applied — order exceeds $750 and ships free to zone 1–6."
      : `Billed on dimensional weight (${lbs.toFixed(1)} lb) from ${SITE.city}, ${SITE.state} · zone ${zone} · ${stateName(input.state)}.`,
  });

  options.push({
    id: "ups-2day",
    carrier: "UPS",
    service: "2nd Day Air · dimensional rate",
    cost: allowance ? Math.round(air * 0.55) : air,
    transitDays: "2 business days",
    mode: "parcel",
    billableLbs: Math.round(lbs * 10) / 10,
    dimWeightLbs: input.dimWeightLbs,
    note: "Guaranteed by 10:30am. Oversize cartons may be re-rated at pickup.",
  });

  return options;
}

async function easyPostOptions(input: {
  state: string;
  zip: string;
  city: string;
  billableLbs: number;
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

    const unique = rates.filter(
      (rate, index) => rates.findIndex((other) => other.carrier === rate.carrier && other.service === rate.service) === index,
    );
    const picked = unique.slice(0, 3).map((rate, index) => ({
      // EasyPost issues new rate ids on every quote; carrier + service is stable across the
      // quote, payment and order calls, so the buyer's choice is matched, never swapped.
      id: `easypost-${rate.carrier}-${rate.service}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      carrier: rate.carrier,
      service: rate.service,
      cost: Math.round(Number(rate.rate) * 100),
      transitDays: rate.delivery_days ? `${rate.delivery_days} business days` : "3–5 business days",
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
    lines: input.lines,
  });

  if (live) {
    if (summary.palletised) {
      const ltl = matrixOptions({
        state: input.state,
        subtotal: input.subtotal,
        billableLbs: summary.billableLbs,
        dimWeightLbs: summary.dimWeightLbs,
        cartons: summary.cartons,
        palletised: true,
      }).find((option) => option.mode === "ltl");
      if (ltl) live.push(ltl);
    }
    return {
      options: live,
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
    options: matrixOptions({
      state: input.state,
      subtotal: input.subtotal,
      billableLbs: summary.billableLbs,
      dimWeightLbs: summary.dimWeightLbs,
      cartons: summary.cartons,
      palletised: summary.palletised,
    }),
    billableLbs: summary.billableLbs,
    dimWeightLbs: summary.dimWeightLbs,
    cartons: summary.cartons,
    palletised: summary.palletised,
    source: "dimensional_matrix",
    zone: zoneFor(input.state),
    note: "Priced with the Ciputra dimensional freight matrix (billable weight = greater of actual and dim weight, dim divisor 139).",
  };
}
