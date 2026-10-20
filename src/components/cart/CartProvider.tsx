"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartView, CartViewLine } from "@/lib/cart-view";

/** A cart line plus whether its price is still the one the server returned for this quantity. */
export type CartLine = CartViewLine & { stale: boolean };

/**
 * The cart keeps nothing but the product id and the number of cases (SEP-3). Names, pack sizes
 * and every price are read back from `/api/cart`, so prices cannot go stale in local storage,
 * cannot survive a sign-out, and cannot be edited by the buyer.
 */
export type CartItem = { productId: number; cases: number };

export type AddToCartInput = { productId: number; cases?: number; minCases?: number };

type CartContextValue = {
  items: CartItem[];
  lines: CartLine[];
  hydrated: boolean;
  /** A price refresh is in flight; the lines on screen may be one edit behind. */
  loading: boolean;
  pricesVisible: boolean;
  isOpen: boolean;
  /** Cases in the cart (the header badge). */
  count: number;
  /** Selling units across all cases. */
  units: number;
  /** Goods total after tier and contract pricing, or null while prices are locked. */
  subtotal: number | null;
  messages: string[];
  addItem: (item: AddToCartInput, cases?: number) => void;
  setCases: (productId: number, cases: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
  refresh: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "meridian_cart_v2";
/** Pre-SEP-3 carts stored the whole product, prices included; only the quantities are kept. */
const LEGACY_STORAGE_KEY = "meridian_cart_v1";

function readStored(key: string): CartItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { productId?: unknown; cases?: unknown }[];
    if (!Array.isArray(parsed)) return [];
    const merged = new Map<number, number>();
    for (const entry of parsed) {
      const productId = Number(entry?.productId);
      const cases = Number(entry?.cases);
      if (!Number.isInteger(productId) || !Number.isFinite(cases) || cases <= 0) continue;
      merged.set(productId, (merged.get(productId) ?? 0) + Math.ceil(cases));
    }
    return [...merged].map(([productId, cases]) => ({ productId, cases }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [view, setView] = useState<CartView | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const stored = readStored(STORAGE_KEY);
    const legacy = stored.length ? [] : readStored(LEGACY_STORAGE_KEY);
    if (legacy.length) {
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // storage may be unavailable in private mode
      }
    }
    setItems(stored.length ? stored : legacy);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage may be unavailable in private mode
    }
  }, [items, hydrated]);

  // Every change is priced again on the server; the answer that comes back last wins.
  const load = useCallback(async (lines: CartItem[]) => {
    const id = ++requestId.current;
    if (!lines.length) {
      setView(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = (await response.json()) as { cart?: CartView };
      if (id !== requestId.current) return;
      if (data.cart) {
        setView(data.cart);
        if (data.cart.removedProductIds.length) {
          const gone = new Set(data.cart.removedProductIds);
          setItems((current) => current.filter((line) => !gone.has(line.productId)));
        }
      }
    } catch {
      // Offline or a failed request: keep showing the last good answer.
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => void load(items), 150);
    return () => clearTimeout(timer);
  }, [items, hydrated, load]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const addItem = useCallback((item: AddToCartInput, cases?: number) => {
    const floor = Math.max(1, item.minCases ?? 1);
    const quantity = Math.max(floor, Math.ceil(cases ?? item.cases ?? floor));
    setItems((current) => {
      const existing = current.find((line) => line.productId === item.productId);
      if (existing) {
        return current.map((line) =>
          line.productId === item.productId ? { ...line, cases: line.cases + quantity } : line,
        );
      }
      return [...current, { productId: item.productId, cases: quantity }];
    });
    setIsOpen(true);
  }, []);

  const setCases = useCallback((productId: number, cases: number) => {
    setItems((current) =>
      current.map((line) => (line.productId === productId ? { ...line, cases: Math.max(1, Math.ceil(cases)) } : line)),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setView(null);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const stored = new Map(items.map((line) => [line.productId, line.cases]));
    // Show the stored quantity even when the server answer is one keystroke behind; the price
    // belongs to the quantity the server priced, so mark it stale until the next answer lands.
    const lines: CartLine[] = (view?.lines ?? [])
      .filter((line) => stored.has(line.productId))
      .map((line) => {
        const cases = stored.get(line.productId) ?? line.cases;
        return { ...line, cases, stale: cases !== line.cases };
      });
    return {
      items,
      lines,
      hydrated,
      loading,
      pricesVisible: view?.pricesVisible ?? false,
      isOpen,
      count: items.reduce((sum, line) => sum + line.cases, 0),
      units: view?.units ?? 0,
      subtotal: view?.subtotal ?? null,
      messages: view?.messages ?? [],
      addItem,
      setCases,
      removeItem,
      clear,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      refresh: () => void load(items),
    };
  }, [items, view, hydrated, loading, isOpen, addItem, setCases, removeItem, clear, load]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
