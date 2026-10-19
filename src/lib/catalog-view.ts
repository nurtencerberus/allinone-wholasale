import type { Product } from "@/db/schema";

/**
 * What a product card or cart line may receive in the browser. Wholesale prices are
 * `null` unless the viewer may see them, so a locked price never reaches the page source
 * or the React Server Component payload.
 */
export type CardProduct = {
  id: number;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  tagline: string;
  image: string;
  badges: string[];
  category: string;
  caseSize: number;
  minCases: number;
  msrpUnit: number;
  weightLbs: number;
  stock: number;
  casePrice: number | null;
};

export function toCardProduct(product: Product, showPrices: boolean): CardProduct {
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    tagline: product.tagline,
    image: product.image,
    badges: product.badges ?? [],
    category: product.category,
    caseSize: product.caseSize,
    minCases: product.minCases,
    msrpUnit: product.msrpUnit,
    weightLbs: product.weightLbs,
    stock: product.stock,
    casePrice: showPrices ? product.casePrice : null,
  };
}
