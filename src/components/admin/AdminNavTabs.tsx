"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  Undo2,
  UserCog,
  FileCheck2,
  LogOut,
  Warehouse,
} from "lucide-react";
import type { Permission } from "@/lib/staff";

const TABS: { href: string; label: string; icon: typeof Boxes; permission: Permission }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, permission: "view" },
  { href: "/admin/orders", label: "Orders", icon: Package, permission: "view" },
  { href: "/admin/returns", label: "Returns", icon: Undo2, permission: "view" },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse, permission: "view" },
  { href: "/admin/products", label: "Products", icon: Boxes, permission: "view" },
  { href: "/admin/catalog", label: "Bulk import", icon: Database, permission: "products" },
  { href: "/admin/users", label: "Users", icon: UserCog, permission: "view" },
  { href: "/admin#applications", label: "Applications", icon: FileCheck2, permission: "view" },
  { href: "/admin/lists", label: "Wholesale lists", icon: FileSpreadsheet, permission: "view" },
  { href: "/admin/reports/tax", label: "Tax report", icon: Receipt, permission: "reports" },
  { href: "/admin/audit", label: "Audit log", icon: History, permission: "staff" },
];

export function AdminNavTabs({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-cream/12 bg-ink">
      <div className="wrap flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1">
          {TABS.filter((tab) => permissions.includes(tab.permission)).map((tab) => {
            const active =
              tab.href === "/admin"
                ? pathname === "/admin"
                : tab.href.startsWith("/admin") && !tab.href.includes("#")
                  ? pathname.startsWith(tab.href)
                  : false;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-t-md px-3 py-2.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-cream text-ink"
                    : "text-cream/60 hover:bg-cream/10 hover:text-cream"
                }`}
              >
                <tab.icon size={13} /> {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/";
          }}
          className="flex items-center gap-1.5 rounded-full border border-cream/20 px-3 py-1.5 text-[10.5px] font-semibold text-cream/70 hover:bg-cream/10 hover:text-cream"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </div>
  );
}
