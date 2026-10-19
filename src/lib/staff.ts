// Client-safe staff roles and permissions (no database or cookie imports).

export const STAFF_ROLES = ["admin", "ops", "sales", "accounting", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROLES = ["customer", ...STAFF_ROLES] as const;

export type Permission =
  | "view" // read every admin screen
  | "products" // catalog, photos, bulk import
  | "inventory" // receive lots, adjust stock, holds and recalls
  | "orders" // fulfilment status, tracking, notes
  | "payments" // mark paid, cancel with refund, return refunds
  | "accounts" // applications, trade tier, discount, tax exemption
  | "lists" // supplier price lists
  | "reports" // tax and sales reports
  | "staff"; // grant or remove staff roles, reset two-factor, read the audit log

const GRANTS: Record<StaffRole, readonly Permission[]> = {
  admin: ["view", "products", "inventory", "orders", "payments", "accounts", "lists", "reports", "staff"],
  ops: ["view", "products", "inventory", "orders"],
  sales: ["view", "accounts", "lists"],
  accounting: ["view", "payments", "reports"],
  viewer: ["view"],
};

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  admin: "Owner / admin",
  ops: "Operations",
  sales: "Sales",
  accounting: "Accounting",
  viewer: "Read-only",
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

export function hasPermission(user: { role: string } | null | undefined, permission: Permission): boolean {
  if (!user || !isStaffRole(user.role)) return false;
  return GRANTS[user.role].includes(permission);
}

export function permissionsFor(role: string): Permission[] {
  return isStaffRole(role) ? [...GRANTS[role]] : [];
}
