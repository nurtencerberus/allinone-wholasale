import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { coupons, products, type Dimensions } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { quoteShipping, summariseFreight, type ShippingOption } from "@/lib/shipping";
import { quoteTax, type TaxQuote } from "@/lib/tax";
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
  cases: number;
  caseSize: number;
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
  messages: string[];
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

export async function priceCart(input: {
  items: CartItemInput[];
  user?: SessionUser | null;
  couponCode?: string | null;
  address?: CheckoutAddress | null;
  shippingOptionId?: string | null;
}): Promise<PricedOrder | { error: string }> {
  const cleaned = input.items
    .filter((item) => Number.isFinite(item.productId) && item.cases > 0)
    .map((item) => ({ productId: Number(item.productId), cases: Math.min(999, Math.ceil(item.cases)) }));

  if (!cleaned.length) return { error: "Your cart is empty." };

  const rows = await db
    .select()
    .from(products)
    .where(inArray(products.id, cleaned.map((item) => item.productId)));

  if (!rows.length) return { error: "No orderable products in this cart." };

  const byId = new Map(rows.map((row) => [row.id, row]));
  const user = input.user ?? null;
  const wholesaleActive = user?.accountTier === "wholesale";
  const discountPct = wholesaleActive ? Math.min(Math.max(user?.wholesaleDiscountPct ?? 0, 0), 40) : 0;

  const lines: PricedLine[] = [];
  for (const item of cleaned) {
    const product = byId.get(item.productId);
    if (!product || !product.active) continue;
    if (item.cases > product.stock) {
      return { error: `${product.name}: only ${product.stock} case(s) in stock.` };
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
      cases: item.cases,
      caseSize: product.caseSize,
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

  if (!lines.length) return { error: "No orderable products in this cart." };

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

  // Freight -----------------------------------------------------------
  const goodsBase = afterTier - accountDiscount - couponDiscount;
  const freightLines = lines.map((line) => ({
    weightLbs: line.weightLbs,
    dimensions: line.dimensions,
    cases: line.cases,
  }));
  const summary = summariseFreight(freightLines);
  const address = input.address;
  const shipping = await quoteShipping({
    state: address?.state ?? "",
    zip: address?.zip ?? "",
    city: address?.city ?? "",
    subtotal: goodsBase,
    lines: address ? freightLines : [],
  });

  let shippingOption =
    shipping.options.find((option) => option.id === input.shippingOptionId) ??
    shipping.options[0] ??
    null;

  if (freeFreight && shippingOption && shippingOption.mode === "parcel") {
    shippingOption = { ...shippingOption, cost: 0, note: `${couponCode} freight waiver applied.` };
  }

  const shippingCost = shippingOption?.cost ?? 0;
  const shippingListCost =
    shipping.options.find((option) => option.id === shippingOption?.id)?.cost ?? shippingCost;

  // Tax ---------------------------------------------------------------
  const taxableBase = Math.max(0, goodsBase + shippingCost);
  const taxQuote = address
    ? await quoteTax({
        state: address.state,
        zip: address.zip,
        city: address.city,
        amount: taxableBase,
        taxExempt: Boolean(user?.taxExempt),
      })
    : {
        rateX1000: 0,
        amount: 0,
        jurisdiction: "Awaiting delivery address",
        source: "nexus_table" as const,
        taxable: false,
        note: "Sales tax is calculated from the destination ZIP code at checkout.",
      };

  const total = Math.max(0, goodsBase + shippingCost + taxQuote.amount);

  const messages: string[] = [];
  if (goodsBase < SITE.minOrderValue) {
    messages.push(
      `A ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(SITE.minOrderValue / 100)} wholesale minimum applies to freight-paid orders. Add ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((SITE.minOrderValue - goodsBase) / 100)} to qualify.`,
    );
  }
  if (!address) {
    messages.push("Enter a ZIP code to lock the destination sales-tax rate and dimensional freight.");
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
  };
}
