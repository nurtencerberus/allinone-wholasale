import { cookies } from "next/headers";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginChallenges, users, type User } from "@/db/schema";
import { digestToken, randomToken } from "@/lib/password";
import { normaliseRecoveryCode, verifyTotp } from "@/lib/totp";

export const MFA_COOKIE = "meridian_2fa";
const CHALLENGE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function twoFactorEnabled(user: Pick<User, "totpEnabledAt" | "totpSecret">): boolean {
  return Boolean(user.totpEnabledAt && user.totpSecret);
}

/** Password accepted: park the sign-in until the second factor arrives. */
export async function startLoginChallenge(userId: number): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.delete(loginChallenges).where(or(eq(loginChallenges.userId, userId), lt(loginChallenges.expiresAt, new Date())));
  await db.insert(loginChallenges).values({ tokenDigest: digestToken(token), userId, expiresAt });
  const store = await cookies();
  store.set(MFA_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearLoginChallenge(): Promise<void> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  if (token) await db.delete(loginChallenges).where(eq(loginChallenges.tokenDigest, digestToken(token)));
  store.set(MFA_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

/**
 * Checks a TOTP or recovery code against the parked sign-in. Each challenge allows five tries.
 * Returns the user on success; the caller then creates the session.
 */
export async function completeLoginChallenge(
  code: string,
): Promise<{ ok: true; user: User; usedRecoveryCode: boolean } | { ok: false; error: string; restart?: boolean }> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  if (!token) return { ok: false, error: "Your sign-in timed out. Enter your password again.", restart: true };

  const [challenge] = await db
    .update(loginChallenges)
    .set({ attempts: sql`${loginChallenges.attempts} + 1` })
    .where(
      and(
        eq(loginChallenges.tokenDigest, digestToken(token)),
        gt(loginChallenges.expiresAt, new Date()),
        lt(loginChallenges.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!challenge) {
    await clearLoginChallenge();
    return { ok: false, error: "Too many attempts or the sign-in timed out. Enter your password again.", restart: true };
  }

  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  if (!user || !user.totpSecret) {
    await clearLoginChallenge();
    return { ok: false, error: "Sign-in could not be completed.", restart: true };
  }

  const verified = await consumeSecondFactor(user, code);
  if (!verified.ok) return { ok: false, error: "That code is not valid. Try the current code from your app." };

  await clearLoginChallenge();
  return { ok: true, user, usedRecoveryCode: verified.recovery };
}

/** Accepts a fresh TOTP code (never the same step twice) or burns one recovery code. */
export async function consumeSecondFactor(
  user: Pick<User, "id" | "totpSecret" | "totpLastStep">,
  code: string,
): Promise<{ ok: true; recovery: boolean } | { ok: false }> {
  const clean = code.trim();
  if (user.totpSecret && /^\d{6}$/.test(clean.replace(/\s+/g, ""))) {
    const step = verifyTotp(user.totpSecret, clean, user.totpLastStep);
    if (step === null) return { ok: false };
    const [claimed] = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
      .returning({ id: users.id });
    return claimed ? { ok: true, recovery: false } : { ok: false };
  }

  const digest = digestToken(normaliseRecoveryCode(clean));
  const [burned] = await db
    .update(users)
    .set({ recoveryCodes: sql`${users.recoveryCodes} - ${digest}::text` })
    .where(and(eq(users.id, user.id), sql`${users.recoveryCodes} ? ${digest}::text`))
    .returning({ id: users.id });
  return burned ? { ok: true, recovery: true } : { ok: false };
}
