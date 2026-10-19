"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { Product } from "@/db/schema";
import { formatMoney, unitPriceOf } from "@/lib/money";

export function ProductCard({ product, index }: { product: Product; index?: number }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const unitPrice = unitPriceOf(product.casePrice, product.caseSize);
  const msrpCase = product.msrpUnit * product.caseSize;
  const margin = msrpCase > 0 ? Math.round(((msrpCase - product.casePrice) / msrpCase) * 100) : 0;

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-[#fffdf8] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(20,36,28,0.45)]"
      style={index !== undefined ? { animationDelay: `${Math.min(index, 8) * 45}ms` } : undefined}
    >
      <Link href={`/products/${product.slug}`} className="relative block overflow-hidden bg-parchment">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.badges.slice(0, 2).map((badge) => (
            <span
              key={badge}
              className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] uppercase ${
                badge === "Low stock" ? "bg-clay text-white" : "bg-cream/95 text-ink/75 backdrop-blur"
              }`}
            >
              {badge}
            </span>
          ))}
        </div>
        <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] text-cream uppercase backdrop-blur">
          {product.caseSize} units / case
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold tracking-[0.16em] text-fern uppercase">{product.brand}</p>
          {product.reviewCount > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-ink/60">
              <Star size={11} className="fill-gold text-gold" />
              {(product.ratingX10 / 10).toFixed(1)}
              <span className="font-normal text-ink/35">({product.reviewCount})</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold tracking-[0.1em] text-clay uppercase">New</span>
          )}
        </div>

        <Link href={`/products/${product.slug}`} className="mt-1.5 block">
          <h3 className="font-display text-[17px] leading-tight tracking-[-0.01em] hover:underline">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink/55">{product.tagline}</p>

        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[17px] font-bold leading-none tabular-nums">
                {formatMoney(product.casePrice)}
                <span className="ml-1 text-[10.5px] font-medium text-ink/45">/ case</span>
              </p>
              <p className="mt-1 text-[10.5px] text-ink/50">
                {formatMoney(unitPrice)} / unit · MSRP {formatMoney(product.msrpUnit)}
              </p>
            </div>
            <span className="rounded-full bg-fern/10 px-2 py-1 text-[10px] font-bold text-fern">
              {margin}% margin
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <Link
              href={`/products/${product.slug}`}
              className="btn btn-outline btn-sm flex-1 justify-center"
            >
              Details
            </Link>
            <button
              type="button"
              disabled={adding}
              onClick={() => {
                setAdding(true);
                addItem(
                  {
                    productId: product.id,
                    slug: product.slug,
                    name: product.name,
                    sku: product.sku,
                    image: product.image,
                    casePrice: product.casePrice,
                    caseSize: product.caseSize,
                    msrpUnit: product.msrpUnit,
                    minCases: product.minCases,
                    category: product.category,
                    weightLbs: product.weightLbs,
                  },
                  product.minCases,
                );
                window.setTimeout(() => setAdding(false), 500);
              }}
              aria-label={`Add ${product.name} case to cart`}
              className="btn btn-primary btn-sm relative px-3"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
