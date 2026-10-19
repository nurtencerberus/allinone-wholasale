import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser, staffTwoFactorRequired } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { escapeHtml, sendEmail } from "@/lib/email";
import { digestToken, verifyPasswordOrDummy } from "@/lib/password";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { SITE } from "@/lib/site";
import { isStaffRole } from "@/lib/staff";
import { newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { consumeSecondFactor, twoFactorEnabled } from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { action?: string; code?: string; password?: string };

export async function GET() {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const [user] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json({
    enabled: twoFactorEnabled(user),
    enabledAt: user.totpEnabledAt?.toISOString() ?? null,
    recoveryCodesLeft: user.recoveryCodes.length,
    required: isStaffRole(user.role) && staffTwoFactorRequired(),
  });
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
    const limit = await consumeRateLimit("two-factor-setup", `${session.id}|${clientIp(request)}`, 20, 900);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const [user] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Body;
    const actor = { id: user.id, email: user.email };

    if (body.action === "start") {
      if (twoFactorEnabled(user)) {
        return Response.json({ error: "Two-factor sign-in is already on. Turn it off first to move it to a new device." }, { status: 409 });
      }
      const secret = newTotpSecret();
      await db.update(users).set({ totpPendingSecret: secret }).where(eq(users.id, user.id));
      const uri = otpauthUri(secret, user.email, SITE.shortName);
      const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 196 });
      return Response.json({ ok: true, secret, uri, qrSvg });
    }

    if (body.action === "confirm") {
      if (!user.totpPendingSecret) return Response.json({ error: "Start the set-up again." }, { status: 409 });
      const step = verifyTotp(user.totpPendingSecret, String(body.code ?? ""), null);
      if (step === null) {
        return Response.json({ error: "That code does not match. Check the time on your phone and try the current code." }, { status: 400 });
      }
      const codes = newRecoveryCodes();
      await db
        .update(users)
        .set({
          totpSecret: user.totpPendingSecret,
          totpPendingSecret: null,
          totpEnabledAt: new Date(),
          totpLastStep: step,
          recoveryCodes: codes.map((code) => digestToken(code)),
        })
        .where(eq(users.id, user.id));
      await recordAudit(db, { actor, action: "two_factor.enable", entityType: "user", entityId: user.id, request });
      await notify(user.email, user.name, "Two-factor sign-in was turned on for your account.");
      return Response.json({ ok: true, recoveryCodes: codes });
    }

    if (body.action === "recovery-codes") {
      if (!twoFactorEnabled(user)) return Response.json({ error: "Two-factor sign-in is off." }, { status: 409 });
      const check = await consumeSecondFactor(user, String(body.code ?? ""));
      if (!check.ok) return Response.json({ error: "That code is not valid." }, { status: 400 });
      const codes = newRecoveryCodes();
      await db.update(users).set({ recoveryCodes: codes.map((code) => digestToken(code)) }).where(eq(users.id, user.id));
      await recordAudit(db, { actor, action: "two_factor.recovery_codes", entityType: "user", entityId: user.id, request });
      return Response.json({ ok: true, recoveryCodes: codes });
    }

    if (body.action === "disable") {
      if (!twoFactorEnabled(user)) return Response.json({ error: "Two-factor sign-in is already off." }, { status: 409 });
      if (isStaffRole(user.role) && staffTwoFactorRequired()) {
        return Response.json({ error: "Staff accounts must keep two-factor sign-in on." }, { status: 403 });
      }
      if (!verifyPasswordOrDummy(String(body.password ?? ""), user.passwordHash)) {
        return Response.json({ error: "Password is incorrect." }, { status: 400 });
      }
      const check = await consumeSecondFactor(user, String(body.code ?? ""));
      if (!check.ok) return Response.json({ error: "That code is not valid." }, { status: 400 });
      await db
        .update(users)
        .set({ totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] })
        .where(eq(users.id, user.id));
      await recordAudit(db, { actor, action: "two_factor.disable", entityType: "user", entityId: user.id, request });
      await notify(user.email, user.name, "Two-factor sign-in was turned off for your account.");
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[two-factor]", error);
    return Response.json({ error: "Two-factor set-up failed." }, { status: 500 });
  }
}

async function notify(email: string, name: string, sentence: string) {
  try {
    await sendEmail({
      to: email,
      subject: `${SITE.shortName} account security`,
      html: `<p>Hi ${escapeHtml(name.split(" ")[0])},</p><p>${escapeHtml(sentence)} If this was not you, reset your password and contact ${escapeHtml(SITE.email)} right away.</p>`,
    });
  } catch (error) {
    console.error("[two-factor-email]", error);
  }
}
