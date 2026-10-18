"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { Product } from "@/db/schema";
import { formatMoney, unitPriceOf } from "@/lib/money";

export function BuyBox({
  product,
  accountDiscountPct,
  taxExempt,
  wholesaleApproved,
}: {
  product: Product;
  accountDiscountPct: number;
  taxExempt: boolean;
  wholesaleApproved: boolean;
}) {
  const { addItem } = useCart();
  const [cases, setCases] = useState(Math.max(1, product.minCases));
  const [added, setAdded] = useState(false);

  const tier = useMemo(() => {
    let best = { minCases: 1, casePrice: product.casePrice };
    for (const entry of product.priceTiers ?? []) {
      if (cases >= entry.minCases) best = entry;
    }
    return best;
  }, [cases, product.casePrice, product.priceTiers]);

  const nextTier = (product.priceTiers ?? []).find((entry) => cases < entry.minCases);
  const accountPrice = accountDiscountPct
    ? Math.round(tier.casePrice * (1 - accountDiscountPct / 100))
    : tier.casePrice;
  const msrpCase = product.msrpUnit * product.caseSize;
  const marginPct = msrpCase ? Math.round(((msrpCase - accountPrice) / msrpCase) * 100) : 0;
  const lowStock = product.stock <= 10;

  const handleAdd = () => {
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        image: product.image,
        casePrice: accountPrice,
        caseSize: product.caseSize,
        msrpUnit: product.msrpUnit,
        minCases: product.minCases,
        category: product.category,
        weightLbs: product.weightLbs,
      },
      cases,
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  return (
    <div>
      <div className="rounded-xl border border-ink/12 bg-[#fffdf8] p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink/40 uppercase">
              Trade case price
            </p>
            <p className="display mt-1 text-[32px] leading-none">
              {formatMoney(accountPrice)}
              <span className="ml-1.5 font-sans text-[11px] font-medium text-ink/50">/ case</span>
            </p>
            <p className="mt-1.5 text-[11.5px] text-ink/55">
              {formatMoney(unitPriceOf(accountPrice, product.caseSize))} per unit ·{" "}
              {product.caseSize} units per case
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-[0.14em] text-ink/40 uppercase">MSRP case</p>
            <p className="mt-1 text-[15px] font-semibold text-ink/60 line-through tabular-nums">
              {formatMoney(msrpCase)}
            </p>
            <span className="mt-1 inline-flex rounded-full bg-fern/10 px-2 py-0.5 text-[10.5px] font-bold text-fern">
              {marginPct}% margin
            </span>
          </div>
        </div>

        {wholesaleApproved ? (
          <div className="mt-3 rounded-lg bg-moss px-3 py-2 text-[10.5px] font-semibold text-cream">
            Trade account pricing: {accountDiscountPct}% contract discount applied
            {taxExempt ? " · resale tax exemption on file" : ""}
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-parchment px-3 py-2 text-[10.5px] text-ink/60">
            Catalog case price shown.{" "}
            <Link href="/wholesale/apply" className="font-bold underline">
              Approved accounts
            </Link>{" "}
            stack a contract discount and resale tax exemption.
          </div>
        )}

        <div className="mt-4 flex items-stretch gap-2">
          <div className="flex items-center rounded-full border border-ink/20 bg-white">
            <button
              onClick={() => setCases((value) => Math.max(product.minCases, value - 1))}
              aria-label="Decrease cases"
              className="px-3 py-2.5 text-ink/60 hover:text-ink"
            >
              <Minus size={14} />
            </button>
            <div className="min-w-12 text-center">
              <p className="text-[14px] font-bold leading-none tabular-nums">{cases}</p>
              <p className="mt-0.5 text-[8.5px] font-semibold tracking-wide text-ink/40 uppercase">
                cases
              </p>
            </div>
            <button
              onClick={() => setCases((value) => value + 1)}
              aria-label="Increase cases"
              className="px-3 py-2.5 text-ink/60 hover:text-ink"
            >
              <Plus size={14} />
            </button>
          </div>
          <button onClick={handleAdd} className="btn btn-primary flex-1">
            {added ? (
              <>
                <Check size={16} /> Added to cart
              </>
            ) : (
              <>
                Add {cases} case{cases === 1 ? "" : "s"} · {formatMoney(accountPrice * cases)}
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            setCases(10);
            window.setTimeout(handleAdd, 80);
          }}
          className="mt-2 w-full rounded-full border border-ink/15 px-4 py-2 text-[11px] font-bold text-ink/70 hover:border-ink/40 hover:text-ink"
        >
          Build a 10-case pallet and unlock tier pricing
        </button>

        {nextTier ? (
          <p className="mt-2.5 text-center text-[10.5px] text-clay">
            Add {nextTier.minCases - cases} more case{nextTier.minCases - cases === 1 ? "" : "s"} for{" "}
            {formatMoney(nextTier.casePrice)} / case
          </p>
        ) : (
          <p className="mt-2.5 text-center text-[10.5px] font-semibold text-fern">
            Best case tier applied · receive a freight quote at checkout
          </p>
        )}

        <div className="mt-4 space-y-2 border-t border-ink/10 pt-3.5">
          {[
            {
              icon: Check,
              text: lowStock
                ? `Only ${product.stock} cases left in Newark — allocation held for 60 minutes`
                : `In stock · ${product.stock} cases ready to pick in Newark`,
              tone: lowStock ? "text-clay" : "text-fern",
            },
            {
              icon: Truck,
              text: `Dimensional freight quoted at checkout · ${product.weightLbs} lb carton`,
              tone: "text-ink/60",
            },
            {
              icon: ShieldCheck,
              text: "Card data tokenised by Stripe Elements · we never store PANs",
              tone: "text-ink/60",
            },
          ].map((item) => (
            <p key={item.text} className={`flex items-start gap-2 text-[11px] leading-relaxed ${item.tone}`}>
              <item.icon size={13} className="mt-0.5 shrink-0" /> {item.text}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink/12">
        <div className="flex items-center justify-between bg-parchment/60 px-4 py-2.5">
          <p className="text-[10px] font-bold tracking-[0.14em] text-ink/55 uppercase">Volume ladder</p>
          <Link
            href="/quick-order"
            className="flex items-center gap-1 text-[10.5px] font-bold text-fern hover:underline"
          >
            Bulk SKU entry <ArrowRight size={11} />
          </Link>
        </div>
        <table className="w-full text-left text-[11.5px]">
          <tbody>
            {[{ minCases: 1, casePrice: product.casePrice }, ...(product.priceTiers ?? [])].map(
              (entry) => {
                const isActive = tier.minCases === entry.minCases;
                return (
                  <tr
                    key={entry.minCases}
                    className={`border-b border-ink/5 last:border-0 ${isActive ? "bg-fern/8" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-semibold">
                      {entry.minCases === 1 ? "1 case" : `${entry.minCases}+ cases`}
                      {isActive ? (
                        <span className="ml-2 rounded-full bg-fern px-1.5 py-0.5 text-[8.5px] font-bold text-cream uppercase">
                          Your tier
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {formatMoney(entry.casePrice)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink/45 tabular-nums">
                      {formatMoney(unitPriceOf(entry.casePrice, product.caseSize))}/unit
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
