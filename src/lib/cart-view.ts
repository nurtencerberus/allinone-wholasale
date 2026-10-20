import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { canSeePrices } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { priceCart, type CartItemInput } from "@/lib/checkout";

/**
 * What the cart drawer and the order summary draw (SEP-3). The browser stores nothing but
 * `{ productId, cases }`; every price here is priced again on the server by `priceCart()`, so a
 * cart that was filled while signed in as a trade account shows no prices once that account
 * signs out, and a catalogue or contract price change is picked up on the next read.
 */
export type CartViewLine = {
  productId: number;
  slug: string;
  name: string;
  sku: string;
  image: string;
  caseSize: number;
  minCases: number;
  stock: number;
  cases: number;
  /** Tier + contract price per case, or null while prices are locked. */
  casePrice: number | null;
  listCasePrice: number | null;
  lineTotal: number | null;
  /** Why this line cannot be ordered as it stands (stock, minimum, line ceiling). */
  problem: string | null;
};

export type CartView = {
  lines: CartViewLine[];
  pricesVisible: boolean;
  /** Goods total after tier and contract pricing, before coupon, freight and tax. */
  subtotal: number | null;
  cases: number;
  units: number;
  /** Lines dropped because the product is inactive or gone; the browser removes them. */
  removedProductIds: number[];
  messages: string[];
};

function emptyView(pricesVisible: boolean): CartView {
  return { lines: [], pricesVisible, subtotal: pricesVisible ? 0 : null, cases: 0, units: 0, removedProductIds: [], messages: [] };
}

/** Merge duplicate lines and drop anything that is not a positive whole number of cases. */
function clean(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<number, number>();
  for (const item of items ?? []) {
    const productId = Number(item?.productId);
    const cases = Number(item?.cases);
    if (!Number.isInteger(productId) || !Number.isFinite(cases) || cases <= 0) continue;
    merged.set(productId, (merged.get(productId) ?? 0) + Math.ceil(cases));
  }
  return [...merged].map(([productId, cases]) => ({ productId, cases }));
}

function lineProblem(line: { name: string; cases: number; minCases: number; stock: number }): string | null {
  if (line.cases < line.minCases) return `Minimum ${line.minCases} case(s).`;
  if (line.cases > line.stock) return line.stock > 0 ? `Only ${line.stock} case(s) in stock.` : "Out of stock.";
  return null;
}

export async function cartView(items: CartItemInput[], user: SessionUser | null): Promise<CartView> {
  const pricesVisible = canSeePrices(user);
  const wanted = clean(items);
  if (!wanted.length) return emptyView(pricesVisible);

  if (!pricesVisible) {
    // Display only: name, pack size and photo, never a price or a stock-driven total.
    const rows = await db
      .select()
      .from(products)
      .where(inArray(products.id, wanted.map((item) => item.productId)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const lines: CartViewLine[] = [];
    const removedProductIds: number[] = [];
    for (const item of wanted) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        removedProductIds.push(item.productId);
        continue;
      }
      lines.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        image: product.image,
        caseSize: product.caseSize,
        minCases: product.minCases,
        stock: product.stock,
        cases: item.cases,
        casePrice: null,
        listCasePrice: null,
        lineTotal: null,
        problem: null,
      });
    }
    return {
      lines,
      pricesVisible,
      subtotal: null,
      cases: lines.reduce((sum, line) => sum + line.cases, 0),
      units: lines.reduce((sum, line) => sum + line.cases * line.caseSize, 0),
      removedProductIds,
      messages: [],
    };
  }

  const priced = await priceCart({ items: wanted, user });
  if ("error" in priced) {
    // Every line is gone (inactive or deleted): tell the browser to clear them.
    return { ...emptyView(pricesVisible), removedProductIds: wanted.map((item) => item.productId), messages: [priced.error] };
  }

  const lines: CartViewLine[] = priced.lines.map((line) => ({
    productId: line.productId,
    slug: line.slug,
    name: line.name,
    sku: line.sku,
    image: line.image,
    caseSize: line.caseSize,
    minCases: line.minCases,
    stock: line.stock,
    cases: line.cases,
    casePrice: line.casePrice,
    listCasePrice: line.listCasePrice,
    lineTotal: line.lineTotal,
    problem: lineProblem(line),
  }));

  return {
    lines,
    pricesVisible,
    subtotal: lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0),
    cases: priced.cases,
    units: priced.unitCount,
    removedProductIds: priced.removedProductIds,
    messages: priced.messages.filter((message) => !message.startsWith("Enter a delivery address")),
  };
}
