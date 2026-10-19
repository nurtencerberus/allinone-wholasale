import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { coupons, products, type Dimensions } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { quoteShipping, summariseFreight, type ShippingOption } from "@/lib/shipping";
import { allocateTax, quoteTax, type TaxAllocation, type TaxQuote } from "@/lib/tax";
import { shipToProblem } from "@/lib/ship-to";
import { SITE } from "@/lib/site";

export type CheckoutAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
};

export type CartItemInput = { productId: number; cases: number };

export type PricedLine = {
  productId: number;
  slug: string;
  name: string;
  sku: string;
  image: string;
  category: string;
  taxClass: string;
  cases: number;
  caseSize: number;
  minCases: number;
  stock: number;
  listCasePrice: number;
  casePrice: number;
  unitPrice: number;
  lineTotal: number;
  catalogLineTotal: number;
  tierSaving: number;
  accountSaving: number;
  weightLbs: number;
  dimensions: Dimensions;
};

export type PricedOrder = {
  lines: PricedLine[];
  subtotal: number;
  accountDiscount: number;
  couponCode: string | null;
  couponLabel: string | null;
  couponDiscount: number;
  shippingCost: number;
  shippingListCost: number;
  shippingOptionId: string | null;
  shippingCarrier: string | null;
  shippingService: string | null;
  shippingOptions: ShippingOption[];
  shippingSource: string;
  shippingNote: string;
  freight: {
    billableLbs: number;
    dimWeightLbs: number;
    cartons: number;
    palletised: boolean;
    zone: number;
  };
  taxQuote: TaxQuote;
  taxAmount: number;
  total: number;
  unitCount: number;
  cases: number;
  isWholesale: boolean;
  accountTier: string;
  /** Informational notes (e.g. an item was removed). */
  messages: string[];
  /** Reasons the order cannot be placed as-is; payment and order endpoints refuse while any exist. */
  blockers: string[];
  /** Cart lines dropped because the product is inactive or deleted; the client removes them. */
  removedProductIds: number[];
  /** Each line's total after the order-level coupon, aligned with `lines`. */
  lineNet: number[];
  /** Taxable base and tax per line and for freight; adds up to `taxAmount`. */
  taxAllocation: TaxAllocation;
};

export function resolveCasePrice(
  product: { casePrice: number; priceTiers: { minCases: number; casePrice: number }[] },
  cases: number,
): number {
  let best = product.casePrice;
  for (const tier of product.priceTiers ?? []) {
    if (cases >= tier.minCases) best = Math.min(best, tier.casePrice);
  }
  return best;
}

/** Hard per-line ceiling; larger volumes go through the trade desk. */
export const MAX_CASES_PER_LINE = 999;

export async function priceCart(input: {
  items: CartItemInput[];
  user?: SessionUser | null;
  couponCode?: string | null;
  address?: CheckoutAddress | null;
  shippingOptionId?: string | null;
}): Promise<PricedOrder | { error: string }> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Merge duplicate lines; never silently change a quantity the buyer asked for.
  const requested = new Map<number, number>();
  for (const item of input.items ?? []) {
    const productId = Number(item.productId);
    const cases = Number(item.cases);
    if (!Number.isInteger(productId) || !Number.isFinite(cases) || cases <= 0) continue;
    requested.set(productId, (requested.get(productId) ?? 0) + Math.ceil(cases));
  }
  const cleaned = [...requested].map(([productId, cases]) => ({ productId, cases }));

  if (!cleaned.length) return { error: "Your cart is empty." };

  const rows = await db
    .select()
    .from(products)
    .where(inArray(products.id, cleaned.map((item) => item.productId)));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const user = input.user ?? null;
  const wholesaleActive = user?.accountTier === "wholesale";
  const discountPct = wholesaleActive ? Math.min(Math.max(user?.wholesaleDiscountPct ?? 0, 0), 40) : 0;

  const lines: PricedLine[] = [];
  const removedProductIds: number[] = [];
  for (const item of cleaned) {
    const product = byId.get(item.productId);
    if (!product || !product.active) {
      removedProductIds.push(item.productId);
      warnings.push(`${product?.name ?? "An item"} is no longer available and was removed from this order.`);
      continue;
    }
    if (item.cases > MAX_CASES_PER_LINE) {
      blockers.push(`${product.name}: orders above ${MAX_CASES_PER_LINE} cases go through the trade desk.`);
    }
    if (item.cases < product.minCases) {
      blockers.push(`${product.name}: minimum order is ${product.minCases} cases.`);
    }
    if (item.cases > product.stock) {
      blockers.push(
        product.stock > 0
          ? `${product.name}: only ${product.stock} case(s) in stock.`
          : `${product.name} is out of stock.`,
      );
    }
    const listCasePrice = resolveCasePrice(product, item.cases);
    const casePrice = discountPct
      ? Math.round(listCasePrice * (1 - discountPct / 100))
      : listCasePrice;
    lines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      image: product.image,
      category: product.category,
      taxClass: product.taxClass,
      cases: item.cases,
      caseSize: product.caseSize,
      minCases: product.minCases,
      stock: product.stock,
      listCasePrice,
      casePrice,
      unitPrice: Math.round(casePrice / Math.max(product.caseSize, 1)),
      lineTotal: casePrice * item.cases,
      catalogLineTotal: product.casePrice * item.cases,
      tierSaving: Math.max(0, (product.casePrice - listCasePrice) * item.cases),
      accountSaving: Math.max(0, (listCasePrice - casePrice) * item.cases),
      weightLbs: product.weightLbs,
      dimensions: product.dimensions,
    });
  }

  if (!lines.length) return { error: "None of the items in this cart are available any more." };

  const subtotal = lines.reduce((sum, line) => sum + line.catalogLineTotal, 0);
  const afterTier = lines.reduce((sum, line) => sum + line.listCasePrice * line.cases, 0);
  const accountDiscount = afterTier - lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const cases = lines.reduce((sum, line) => sum + line.cases, 0);
  const unitCount = lines.reduce((sum, line) => sum + line.cases * line.caseSize, 0);

  // Coupon ------------------------------------------------------------
  let couponDiscount = 0;
  let couponCode: string | null = null;
  let couponLabel: string | null = null;
  let freeFreight = false;
  const code = (input.couponCode ?? "").trim().toUpperCase();
  if (code) {
    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    if (!coupon || !coupon.active) {
      return { error: `Coupon ${code} is not recognised.` };
    }
    const eligibleBase = afterTier - accountDiscount;
    if (eligibleBase < coupon.minSubtotal) {
      return {
        error: `Coupon ${code} requires a product subtotal of $${(coupon.minSubtotal / 100).toFixed(2)}.`,
      };
    }
    couponCode = coupon.code;
    couponLabel = coupon.description;
    if (coupon.kind === "percent") {
      couponDiscount = Math.round((eligibleBase * coupon.value) / 100);
    } else if (coupon.kind === "fixed") {
      couponDiscount = Math.min(coupon.value, eligibleBase);
    } else if (coupon.kind === "shipping") {
      freeFreight = true;
    }
  }

  const goodsBase = afterTier - accountDiscount - couponDiscount;
  if (goodsBase < SITE.minOrderValue) {
    blockers.push(
      `The wholesale minimum order is ${formatUsd(SITE.minOrderValue)}. Add ${formatUsd(SITE.minOrderValue - goodsBase)} to check out.`,
    );
  }

  // Delivery address --------------------------------------------------
  const address = input.address?.zip || input.address?.state ? input.address : null;
  const addressProblem = address ? shipToProblem(address) : null;
  if (addressProblem) blockers.push(addressProblem);
  const deliverable = address && !addressProblem ? address : null;
  // California Proposition 65: the warning must be seen before the purchase is completed.
  const prop65 = deliverable?.state.toUpperCase() === "CA"
    ? lines
        .map((line) => ({ name: line.name, warning: byId.get(line.productId)?.prop65Warning }))
        .filter((entry): entry is { name: string; warning: string } => Boolean(entry.warning))
    : [];

  // Freight -----------------------------------------------------------
  const freightLines = lines.map((line) => ({
    weightLbs: line.weightLbs,
    dimensions: line.dimensions,
    cases: line.cases,
  }));
  const summary = summariseFreight(freightLines);
  const shipping = await quoteShipping({
    state: deliverable?.state ?? "",
    zip: deliverable?.zip ?? "",
    city: deliverable?.city ?? "",
    subtotal: goodsBase,
    lines: deliverable ? freightLines : [],
  });

  // The buyer's choice is honoured or refused, never swapped for a different service.
  let shippingOption: ShippingOption | null = null;
  if (input.shippingOptionId) {
    shippingOption = shipping.options.find((option) => option.id === input.shippingOptionId) ?? null;
    if (!shippingOption && shipping.options.length) {
      blockers.push("The selected freight service is no longer available. Choose a freight option again.");
    }
  } else {
    shippingOption = shipping.options[0] ?? null;
  }

  if (freeFreight && shippingOption && shippingOption.mode === "parcel") {
    shippingOption = { ...shippingOption, cost: 0, note: `${couponCode} freight waiver applied.` };
  }

  const shippingCost = shippingOption?.cost ?? 0;
  const shippingListCost =
    shipping.options.find((option) => option.id === shippingOption?.id)?.cost ?? shippingCost;

  // Tax ---------------------------------------------------------------
  // Order-level coupon is spread across lines by value so each line's taxable amount is net.
  const lineNet = allocateDiscount(
    lines.map((line) => line.lineTotal),
    couponDiscount,
  );
  const taxQuote: TaxQuote = deliverable
    ? quoteTax({
        state: deliverable.state,
        lines: lines.map((line, index) => ({ amount: lineNet[index], taxClass: line.taxClass })),
        shipping: shippingCost,
        exemption: user,
      })
    : {
        rateX1000: 0,
        amount: 0,
        taxableAmount: 0,
        jurisdiction: "Awaiting delivery address",
        source: "no_nexus",
        taxable: false,
        note: "Sales tax is calculated from the delivery address at checkout.",
      };

  const total = Math.max(0, goodsBase + shippingCost + taxQuote.amount);
  const taxAllocation = allocateTax(
    taxQuote,
    deliverable?.state ?? "",
    lines.map((line, index) => ({ amount: lineNet[index], taxClass: line.taxClass })),
  );

  const messages: string[] = [...warnings];
  for (const entry of prop65) {
    messages.push(`⚠ WARNING (California Prop 65) — ${entry.name}: ${entry.warning.replace(/^\s*warning:?\s*/i, "")} www.P65Warnings.ca.gov`);
  }
  if (!deliverable && !addressProblem) {
    messages.push("Enter a delivery address to price freight and sales tax.");
  }

  return {
    lines,
    subtotal,
    accountDiscount,
    couponCode,
    couponLabel,
    couponDiscount,
    shippingCost,
    shippingListCost,
    shippingOptionId: shippingOption?.id ?? null,
    shippingCarrier: shippingOption?.carrier ?? null,
    shippingService: shippingOption?.service ?? null,
    shippingOptions: shipping.options,
    shippingSource: shipping.source,
    shippingNote: shipping.note,
    freight: {
      billableLbs: summary.billableLbs,
      dimWeightLbs: Math.round(summary.dimWeightLbs * 10) / 10,
      cartons: summary.cartons,
      palletised: summary.palletised,
      zone: shipping.zone,
    },
    taxQuote,
    taxAmount: taxQuote.amount,
    total,
    unitCount,
    cases,
    isWholesale: wholesaleActive,
    accountTier: user?.accountTier ?? "retail",
    messages,
    blockers,
    removedProductIds,
    lineNet,
    taxAllocation,
  };
}

/** Splits an order-level discount across lines in proportion to value; rounding lands on the largest line. */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const gross = lineTotals.reduce((sum, value) => sum + value, 0);
  if (!discount || gross <= 0) return [...lineTotals];
  const shares = lineTotals.map((value) => Math.floor((discount * value) / gross));
  const remainder = discount - shares.reduce((sum, value) => sum + value, 0);
  const largest = lineTotals.indexOf(Math.max(...lineTotals));
  shares[largest] += remainder;
  return lineTotals.map((value, index) => value - shares[index]);
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
