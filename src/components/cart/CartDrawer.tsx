"use client";

import Link from "next/link";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { SessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export function CartDrawer({ user }: { user: SessionUser | null }) {
  const { items, isOpen, closeCart, setCases, removeItem, subtotal, cases, hydrated } = useCart();
  if (!isOpen) return null;

  const wholesale = user?.accountTier === "wholesale";
  const remaining = Math.max(0, SITE.freeFreightThreshold - subtotal);
  const progress = Math.min(100, Math.round((subtotal / SITE.freeFreightThreshold) * 100));
  const belowMinimum = subtotal < SITE.minOrderValue;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close cart"
        onClick={closeCart}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade"
      />
      <aside className="animate-drawer absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-cream shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <p className="eyebrow">Your order</p>
            <p className="mt-1 text-sm font-semibold">
              {hydrated ? `${cases} units · ${items.length} SKU${items.length === 1 ? "" : "s"}` : "Loading…"}
            </p>
          </div>
          <button
            onClick={closeCart}
            aria-label="Close"
            className="rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {wholesale ? (
          <div className="border-b border-ink/10 bg-moss px-5 py-2.5 text-[11px] font-semibold tracking-wide text-cream">
            Trade account · {user?.wholesaleDiscountPct}% contract pricing applies at checkout
            {user?.taxExempt ? " · resale tax exempt" : ""}
          </div>
        ) : (
          <div className="border-b border-ink/10 bg-parchment px-5 py-2.5 text-[11px] font-medium text-ink/70">
            Case pricing shown.{" "}
            <Link href="/wholesale/apply" onClick={closeCart} className="font-bold underline">
              Apply for account pricing
            </Link>{" "}
            to stack contract discounts and tax exemption.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <span className="rounded-full bg-parchment p-4 text-fern">
                <ShoppingBag size={26} />
              </span>
              <div>
                <p className="display text-2xl">Your cart is empty</p>
                <p className="mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-ink/60">
                  Build a mixed pallet across supplements, pantry and home goods to consolidate freight.
                </p>
              </div>
              <Link href="/shop" onClick={closeCart} className="btn btn-primary btn-sm">
                Shop the catalog
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-ink/8">
              {items.map((line) => (
                <li key={line.productId} className="flex gap-3 py-4">
                  <Link href={`/products/${line.slug}`} onClick={closeCart} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={line.image}
                      alt={line.name}
                      className="h-[76px] w-[76px] rounded-lg border border-ink/10 object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${line.slug}`}
                        onClick={closeCart}
                        className="line-clamp-2 text-[13px] font-semibold leading-snug hover:underline"
                      >
                        {line.name}
                      </Link>
                      <button
                        onClick={() => removeItem(line.productId)}
                        aria-label={`Remove ${line.name}`}
                        className="rounded p-1 text-ink/35 hover:text-clay"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="mt-0.5 text-[10.5px] font-medium tracking-wide text-ink/45 uppercase">
                      {line.sku} · {line.caseSize} units / case
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-ink/15 bg-white/60">
                        <button
                          onClick={() => setCases(line.productId, line.cases - 1)}
                          aria-label="Decrease cases"
                          className="px-2 py-1.5 text-ink/60 hover:text-ink disabled:opacity-30"
                          disabled={line.cases <= Math.max(1, line.minCases)}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="min-w-8 text-center text-[12px] font-bold tabular-nums">
                          {line.cases}
                        </span>
                        <button
                          onClick={() => setCases(line.productId, line.cases + 1)}
                          aria-label="Increase cases"
                          className="px-2 py-1.5 text-ink/60 hover:text-ink"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-bold tabular-nums">
                          {formatMoney(line.casePrice * line.cases)}
                        </p>
                        <p className="text-[10px] text-ink/45">
                          {formatMoney(line.casePrice)} / case
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <div className="border-t border-ink/10 bg-parchment/50 px-5 py-4">
            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] font-medium text-ink/60">
                <span className="flex items-center gap-1.5">
                  <Truck size={13} /> {remaining > 0 ? `${formatMoney(remaining)} to free freight` : "Free freight unlocked"}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-fern transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/70">Product subtotal</span>
              <span className="font-bold tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink/50">
              Sales tax and dimensional freight are quoted from the delivery ZIP at checkout.
              {belowMinimum ? " Wholesale minimum $150." : ""}
            </p>

            <Link href="/checkout" onClick={closeCart} className="btn btn-primary mt-4 w-full">
              Secure checkout
            </Link>
            <div className="mt-3 flex items-center justify-between text-[10.5px] text-ink/45">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} /> Stripe tokenised · PCI-DSS
              </span>
              <button onClick={closeCart} className="font-semibold text-ink/60 underline">
                Keep browsing
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
