import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { digestToken, randomToken } from "@/lib/password";

export const SESSION_COOKIE = "meridian_session";
const SESSION_DAYS = 30;

/** The database holds only a digest of the cookie, so a DB read cannot be replayed as a login. */
export const hashSessionToken = digestToken;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  role: string;
  accountTier: string;
  wholesaleDiscountPct: number;
  taxExempt: boolean;
  taxExemptState: string | null;
  taxExemptCertNumber: string | null;
  taxExemptExpires: Date | null;
  emailVerified: boolean;
};

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    accountTier: user.accountTier,
    wholesaleDiscountPct: user.wholesaleDiscountPct,
    taxExempt: user.taxExempt,
    taxExemptState: user.taxExemptState,
    taxExemptCertNumber: user.taxExemptCertNumber,
    taxExemptExpires: user.taxExemptExpires,
    emailVerified: user.emailVerified,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const user = rows[0]?.user;
  return user ? toSessionUser(user) : null;
}

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  // Rotate: a session the browser already held must not survive a new sign-in.
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous) await db.delete(sessions).where(eq(sessions.token, hashSessionToken(previous)));

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
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
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
  }
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "admin" ? user : null;
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
