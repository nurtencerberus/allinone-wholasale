"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { SessionUser } from "@/lib/auth";

const NAV = [
  { href: "/shop?category=supplements", label: "Vitamins & Supplements" },
  { href: "/shop?category=pantry", label: "Pantry & Staples" },
  { href: "/shop?category=home", label: "Home & Living" },
  { href: "/wholesale", label: "Wholesale program" },
  { href: "/quick-order", label: "Quick order" },
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const { count, openCart, hydrated } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : "/shop");
    setSearchOpen(false);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-ink text-cream/85">
        <div className="wrap flex h-9 items-center justify-between text-[10.5px] font-medium tracking-[0.14em] uppercase">
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="text-cream">B2B wholesale · USA</span>
            <span className="hidden text-cream/40 sm:inline">|</span>
            <span className="hidden sm:inline">Free freight over $750</span>
            <span className="hidden text-cream/40 md:inline">|</span>
            <span className="hidden md:inline">Net 30 for approved retailers</span>
          </div>
          <a href="tel:+12015550142" className="hidden text-cream/80 hover:text-cream sm:inline">
            Trade desk +1 (201) 555-0142
          </a>
        </div>
      </div>

      <div className="border-b border-ink/10 bg-cream/95 backdrop-blur-md">
        <div className="wrap flex h-[70px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="-ml-1 rounded-full p-2 text-ink hover:bg-ink/5 lg:hidden"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link href="/" className="group flex flex-col leading-none">
              <span className="display text-[24px] sm:text-[27px]">Meridian</span>
              <span className="text-[8.5px] font-semibold tracking-[0.36em] text-fern uppercase">
                Supply Co.
              </span>
            </Link>
          </div>

          <nav className="hidden items-center gap-7 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[12.5px] font-semibold text-ink/75 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/wholesale/apply"
              className="hidden rounded-full border border-ink/25 px-4 py-2 text-[11px] font-bold tracking-[0.08em] uppercase text-ink transition-colors hover:border-ink hover:bg-ink hover:text-cream xl:inline-flex"
            >
              Apply for trade
            </Link>
            <button
              type="button"
              aria-label="Search catalog"
              onClick={() => setSearchOpen((open) => !open)}
              className="rounded-full p-2.5 text-ink hover:bg-ink/5"
            >
              <Search size={18} />
            </button>
            <Link
              href={user ? "/account" : "/login?next=/account"}
              aria-label={user ? "Your account" : "Sign in"}
              className="flex items-center gap-2 rounded-full p-2.5 text-ink hover:bg-ink/5"
            >
              <User size={18} />
              {user ? (
                <span className="hidden text-[11px] font-bold tracking-[0.06em] uppercase md:inline">
                  {user.name.split(" ")[0]}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={openCart}
              aria-label="Open cart"
              className="relative flex items-center gap-2 rounded-full bg-ink px-3.5 py-2.5 text-cream transition-colors hover:bg-moss"
            >
              <ShoppingBag size={17} />
              <span className="text-[11px] font-bold tabular-nums">
                {hydrated ? count : 0}
              </span>
            </button>
          </div>
        </div>

        {searchOpen ? (
          <div className="border-t border-ink/10 bg-cream animate-fade">
            <form onSubmit={submitSearch} className="wrap flex items-center gap-3 py-4">
              <Search size={18} className="text-fern" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search SKUs, formulas, pantry staples…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40"
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Search
              </button>
            </form>
          </div>
        ) : null}

        {menuOpen ? (
          <div className="border-t border-ink/10 bg-cream lg:hidden animate-fade">
            <div className="wrap flex flex-col py-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-ink/5 py-3 text-sm font-semibold text-ink/80"
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex gap-2 py-4">
                <Link href="/wholesale/apply" onClick={() => setMenuOpen(false)} className="btn btn-primary btn-sm flex-1">
                  Apply for trade
                </Link>
                <Link
                  href={user ? "/account" : "/login"}
                  onClick={() => setMenuOpen(false)}
                  className="btn btn-outline btn-sm flex-1"
                >
                  {user ? "My account" : "Sign in"}
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
