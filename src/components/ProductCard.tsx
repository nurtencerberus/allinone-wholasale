"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { CardProduct } from "@/lib/catalog-view";
import { formatMoney, unitPriceOf } from "@/lib/money";

export function ProductCard({ product, index }: { product: CardProduct; index?: number }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const casePrice = product.casePrice;
  const msrpCase = product.msrpUnit * product.caseSize;
  const margin =
    casePrice !== null && msrpCase > 0 ? Math.round(((msrpCase - casePrice) / msrpCase) * 100) : null;

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-[#fffdf8] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(20,36,28,0.45)]"
      style={index !== undefined ? { animationDelay: `${Math.min(index, 8) * 45}ms` } : undefined}
    >
      <Link href={`/products/${product.slug}`} className="relative block aspect-[4/5] overflow-hidden bg-parchment">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
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
          <span className="text-[10px] font-semibold tracking-[0.06em] text-ink/40 uppercase">{product.sku}</span>
        </div>

        <Link href={`/products/${product.slug}`} className="mt-1.5 block">
          <h3 className="font-display text-[17px] leading-tight tracking-[-0.01em] hover:underline">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink/55">{product.tagline}</p>

        <div className="mt-auto pt-4">
          {casePrice === null ? (
            <>
              <p className="text-[10.5px] text-ink/50">
                MSRP {formatMoney(product.msrpUnit)} / unit · min {product.minCases} case{product.minCases === 1 ? "" : "s"}
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`}
                className="btn btn-outline btn-sm mt-3 w-full justify-center"
              >
                <Lock size={13} /> Sign in for wholesale price
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[17px] font-bold leading-none tabular-nums">
                    {formatMoney(casePrice)}
                    <span className="ml-1 text-[10.5px] font-medium text-ink/45">/ case</span>
                  </p>
                  <p className="mt-1 text-[10.5px] text-ink/50">
                    {formatMoney(unitPriceOf(casePrice, product.caseSize))} / unit · MSRP {formatMoney(product.msrpUnit)}
                  </p>
                </div>
                {margin !== null && margin > 0 ? (
                  <span className="rounded-full bg-fern/10 px-2 py-1 text-[10px] font-bold text-fern">
                    {margin}% margin
                  </span>
                ) : null}
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
                  disabled={adding || product.stock < product.minCases}
                  onClick={() => {
                    setAdding(true);
                    addItem({ productId: product.id, minCases: product.minCases }, product.minCases);
                    window.setTimeout(() => setAdding(false), 500);
                  }}
                  aria-label={`Add ${product.minCases} case${product.minCases === 1 ? "" : "s"} of ${product.name} to cart`}
                  className="btn btn-primary btn-sm relative px-3"
                >
                  <Plus size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
