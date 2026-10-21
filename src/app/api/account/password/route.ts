import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { createSession, getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { digestToken, hashPassword, passwordProblem, verifyPasswordOrDummy } from "@/lib/password";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { appOrigin, SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KYT-10: change the password while signed in, and sign every other browser out.
 *
 * Changing a password ends every other session — that is the point of changing it after a
 * laptop goes missing. The current password is required for both actions, so a borrowed
 * session alone cannot lock the owner out of their own account.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

    const limit = await consumeRateLimit("password-change", `${user.id}:${clientIp(request)}`, 10, 60 * 60);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "change");

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row) return Response.json({ error: "Account not found." }, { status: 404 });
    if (!(await verifyPasswordOrDummy(String(body.currentPassword ?? ""), row.passwordHash))) {
      return Response.json({ error: "That is not your current password." }, { status: 403 });
    }

    const current = await currentSessionDigest();

    if (action === "sign-out-everywhere") {
      await db.delete(sessions).where(current ? ne(sessions.token, current) : eq(sessions.userId, user.id));
      return Response.json({ ok: true, message: "Every other browser has been signed out." });
    }

    const next = String(body.newPassword ?? "");
    const weak = passwordProblem(next, row.email);
    if (weak) return Response.json({ error: weak }, { status: 400 });

    const hash = await hashPassword(next);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
      // Every session goes, including this one; a fresh one is issued right after.
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });
    await createSession(user.id);

    try {
      await sendEmail({
        to: row.email,
        subject: `Your ${SITE.name} password was changed`,
        html: `<p>${escapeHtml(row.name.split(" ")[0])}, the password on your account was just changed and every other browser was signed out.</p><p>If this was not you, <a href="${appOrigin()}/forgot-password">reset it now</a> and contact the trade desk.</p>`,
      });
    } catch (error) {
      console.error("[password-change-email]", error);
    }

    return Response.json({ ok: true, message: "Password changed. Other browsers have been signed out." });
  } catch (error) {
    console.error("[password-change]", error);
    return Response.json({ error: "Could not change the password." }, { status: 500 });
  }
}

async function currentSessionDigest(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value ?? jar.get("meridian_session")?.value;
  return raw ? digestToken(raw) : null;
}
