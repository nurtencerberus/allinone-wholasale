import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { demoModeEnabled } from "@/lib/demo-mode";
import { digestToken, randomToken } from "@/lib/password";
import { hasPermission, isStaffRole, type Permission } from "@/lib/staff";

export const SESSION_COOKIE = "ciputra_session";
/**
 * DEV-8: the cookie was named after the old company. A session already in a browser is still
 * read under the old name so nobody is signed out by the rename; new sessions use the new name
 * and sign-out clears both. Drop this once the old cookies have expired (30 days).
 */
const LEGACY_SESSION_COOKIE = "meridian_session";
const SESSION_DAYS = 30;
/** KYT-10: a staff session is a key to the whole console, so it lasts a working day. */
const STAFF_SESSION_HOURS = 8;

/** The database holds only a digest of the cookie, so a DB read cannot be replayed as a login. */
export const hashSessionToken = digestToken;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  /** Company account membership (UX-7); null for a single-person account. */
  companyId: number | null;
  companyRole: string | null;
  /** ODE-6: invoice terms for this account. */
  creditLimit: number;
  paymentTermsDays: number;
  creditHold: boolean;
  role: string;
  accountTier: string;
  wholesaleDiscountPct: number;
  taxExempt: boolean;
  taxExemptState: string | null;
  taxExemptCertNumber: string | null;
  taxExemptExpires: Date | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
};

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company,
    companyId: user.companyId,
    companyRole: user.companyRole,
    creditLimit: user.creditLimit,
    paymentTermsDays: user.paymentTermsDays,
    creditHold: user.creditHold,
    role: user.role,
    accountTier: user.accountTier,
    wholesaleDiscountPct: user.wholesaleDiscountPct,
    taxExempt: user.taxExempt,
    taxExemptState: user.taxExemptState,
    taxExemptCertNumber: user.taxExemptCertNumber,
    taxExemptExpires: user.taxExemptExpires,
    emailVerified: user.emailVerified,
    twoFactorEnabled: Boolean(user.totpEnabledAt && user.totpSecret),
  };
}

/**
 * The signed-in user, looked up once per request (PRF-3). The layout, the page and any nested
 * server component all ask for it; React's cache() turns those into a single query. It is keyed
 * on the request, so a sign-in or sign-out later in the same request is not affected — those
 * routes set the cookie and answer, they do not read the session again afterwards.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const user = rows[0]?.user;
  return user ? toSessionUser(user) : null;
});

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  // Rotate: a session the browser already held must not survive a new sign-in.
  const previous = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (previous) await db.delete(sessions).where(eq(sessions.token, hashSessionToken(previous)));

  // A staff session opens the admin console, so it lasts a working day rather than a month.
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const lifetimeMs = isStaffRole(account?.role)
    ? STAFF_SESSION_HOURS * 60 * 60 * 1000
    : SESSION_DAYS * 24 * 60 * 60 * 1000;

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await db.insert(sessions).values({ token: hashSessionToken(token), userId, expiresAt });
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  for (const name of [SESSION_COOKIE, LEGACY_SESSION_COOKIE]) {
    const token = store.get(name)?.value;
    if (token) await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
    // Clear both names: a browser that still holds the old one must not stay signed in.
    store.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
}

/** Staff must sign in with a second factor. Demo deployments (and local tests) may skip it. */
export function staffTwoFactorRequired(): boolean {
  const flag = (process.env.STAFF_2FA ?? "").trim().toLowerCase();
  if (flag === "required") return true;
  if (flag === "off") return demoModeEnabled(); // never off in live mode
  return !demoModeEnabled();
}

export type StaffCheck =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "signed_out" | "not_staff" | "two_factor" | "forbidden" };

export async function checkStaff(permission: Permission): Promise<StaffCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "signed_out" };
  if (!isStaffRole(user.role)) return { ok: false, reason: "not_staff" };
  if (staffTwoFactorRequired() && !user.twoFactorEnabled) return { ok: false, reason: "two_factor" };
  if (!hasPermission(user, permission)) return { ok: false, reason: "forbidden" };
  return { ok: true, user };
}

/** For API routes: the staff user, or null (respond with staffDenied()). */
export async function requireStaff(permission: Permission): Promise<SessionUser | null> {
  const check = await checkStaff(permission);
  return check.ok ? check.user : null;
}

export function staffDenied(): Response {
  return Response.json(
    { error: "Staff access with two-factor sign-in and the right permission is required." },
    { status: 403 },
  );
}

/** For admin pages: returns the staff user or redirects to the right place. */
export async function requireStaffPage(permission: Permission, path: string): Promise<SessionUser> {
  const check = await checkStaff(permission);
  if (check.ok) return check.user;
  if (check.reason === "signed_out") redirect(`/login?next=${encodeURIComponent(path)}`);
  if (check.reason === "two_factor") redirect(`/account/security?required=1&next=${encodeURIComponent(path)}`);
  redirect(`/admin?denied=${permission}`);
}

/**
 * A post-login redirect target from the query string. Only same-site paths are allowed,
 * so `/login?next=https://evil.example` cannot bounce a fresh session to a phishing page.
 */
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}


export { canSeePrices, PRICE_LOCKED_MESSAGE } from "@/lib/access";
