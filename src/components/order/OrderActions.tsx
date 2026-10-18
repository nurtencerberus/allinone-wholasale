"use client";

import { useState } from "react";
import { Check, Copy, Printer, RotateCcw } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";

export type ReorderItem = {
  productId: number;
  slug: string;
  name: string;
  sku: string;
  image: string;
  casePrice: number;
  caseSize: number;
  msrpUnit: number;
  minCases: number;
  category: string;
  weightLbs: number;
  cases: number;
};

export function OrderActions({
  items,
  unavailable,
}: {
  items: ReorderItem[];
  unavailable: string[];
}) {
  const { addItem } = useCart();
  const [done, setDone] = useState(false);

  const reorder = () => {
    for (const { cases, ...item } of items) addItem(item, cases);
    setDone(true);
  };

  return (
    <div className="no-print flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-sm border border-cream/30 text-cream hover:bg-cream/10"
        >
          <Printer size={14} /> Print invoice
        </button>
        <button
          type="button"
          onClick={reorder}
          disabled={items.length === 0}
          className="btn btn-light btn-sm"
        >
          {done ? <Check size={14} /> : <RotateCcw size={14} />}
          {done ? "Added to cart" : "Reorder all items"}
        </button>
      </div>
      {unavailable.length ? (
        <p className="max-w-[300px] text-right text-[10.5px] leading-relaxed text-cream/60">
          No longer available and skipped: {unavailable.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard can be blocked in some contexts; the number stays selectable
        }
      }}
      aria-label={label}
      className="no-print rounded-md p-1.5 text-ink/45 hover:bg-ink/5 hover:text-ink"
    >
      {copied ? <Check size={14} className="text-fern" /> : <Copy size={14} />}
    </button>
  );
}
