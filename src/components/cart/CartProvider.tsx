"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the cart only exists in the browser: it is read from local storage and merged with the server copy after mount, because neither is available while rendering on the server. The extra render that costs is exactly what the `hydrated` flag is for. */

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
const STORAGE_KEY = "ciputra_cart_v1";
/** Older carts (pre-SEP-3, and the pre-rename key): only the quantities are carried over. */
const LEGACY_STORAGE_KEYS = ["meridian_cart_v2", "meridian_cart_v1"];

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

export function CartProvider({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [view, setView] = useState<CartView | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const stored = readStored(STORAGE_KEY);
    let legacy: CartItem[] = [];
    for (const key of LEGACY_STORAGE_KEYS) {
      if (stored.length || legacy.length) break;
      legacy = readStored(key);
      if (legacy.length) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // storage may be unavailable in private mode
        }
      }
    }
    const local = stored.length ? stored : legacy;
    // The cart lives in local storage, which only exists after mount: reading it during render
    // would not match what the server sent. The one render this costs is the point of the
    // `hydrated` flag, which is why the rule is silenced here rather than worked around.
    setItems(local);

    if (!signedIn) {
      setHydrated(true);
      return;
    }
    // Signed in: fold this browser's cart into the one on the server and take the result, so a
    // cart started on another device is here too (SEP-7).
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cart", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: local }),
        });
        const data = (await response.json()) as { items?: CartItem[]; stored?: boolean };
        if (!cancelled && data.stored && Array.isArray(data.items)) setItems(data.items);
      } catch {
        // Offline: the local cart stands on its own until the next change syncs.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

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

  // Keep the stored cart in step. Last write wins, which is what a buyer expects from the
  // device they are using; a failed write only means the server copy is one change behind.
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    const timer = setTimeout(() => {
      void fetch("/api/cart", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [items, hydrated, signedIn]);

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
