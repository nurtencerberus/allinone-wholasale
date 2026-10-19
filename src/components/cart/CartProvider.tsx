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

export type CartItem = {
  productId: number;
  slug: string;
  name: string;
  sku: string;
  image: string;
  casePrice: number;
  caseSize: number;
  msrpUnit: number;
  minCases: number;
  cases: number;
  category: string;
  weightLbs: number;
};

type CartContextValue = {
  items: CartItem[];
  hydrated: boolean;
  isOpen: boolean;
  count: number;
  cases: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "cases"> & { cases?: number }, cases?: number) => void;
  setCases: (productId: number, cases: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "meridian_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const lastAdded = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .filter((item) => item && typeof item.productId === "number" && item.cases > 0)
              .map((item) => ({ ...item, cases: Math.max(1, Math.ceil(item.cases)) })),
          );
        }
      }
    } catch {
      // ignore corrupt storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage may be unavailable in private mode
    }
  }, [items, hydrated]);

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

  const addItem = useCallback(
    (item: Omit<CartItem, "cases"> & { cases?: number }, cases?: number) => {
      const floor = Math.max(1, item.minCases ?? 1);
      const quantity = Math.max(floor, Math.ceil(cases ?? item.cases ?? floor));
      setItems((current) => {
        const existing = current.find((line) => line.productId === item.productId);
        if (existing) {
          return current.map((line) =>
            line.productId === item.productId ? { ...line, cases: line.cases + quantity } : line,
          );
        }
        return [...current, { ...item, cases: quantity }];
      });
      lastAdded.current = item.productId;
      setIsOpen(true);
    },
    [],
  );

  const setCases = useCallback((productId: number, cases: number) => {
    setItems((current) =>
      current.map((line) =>
        line.productId === productId
          ? { ...line, cases: Math.max(Math.max(1, line.minCases ?? 1), Math.ceil(cases)) }
          : line,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, line) => sum + line.cases, 0);
    const caseCount = items.reduce((sum, line) => sum + line.cases * line.caseSize, 0);
    const subtotal = items.reduce((sum, line) => sum + line.casePrice * line.cases, 0);
    return {
      items,
      hydrated,
      isOpen,
      count,
      cases: caseCount,
      subtotal,
      addItem,
      setCases,
      removeItem,
      clear,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    };
  }, [items, hydrated, isOpen, addItem, setCases, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
