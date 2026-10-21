import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

import { digestToken, hashPassword, passwordProblem, randomToken } from "@/lib/password";
import { appOrigin, SITE } from "@/lib/site";
import { escapeHtml, sendEmail, verifyEmailTemplate } from "@/lib/email";
import { demoModeEnabled } from "@/lib/demo-mode";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const limit = await consumeRateLimit("signup", clientIp(request), 10, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      company?: string;
      phone?: string;
    };

    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const company = (body.company ?? "").trim() || null;

    if (name.length < 2) return Response.json({ error: "Enter your full name." }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const weak = passwordProblem(password, email);
    if (weak) return Response.json({ error: weak }, { status: 400 });

    // KYT-8: never confirm whether an address already has an account. Both paths answer the
    // same way and send an e-mail; only the person who owns the inbox learns which happened.
    const [existing] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      try {
        await sendEmail({
          to: email,
          subject: "Someone tried to create an account with your e-mail",
          html: `<p>${escapeHtml(existing.name.split(" ")[0])}, somebody just tried to sign up at ${SITE.name} with this address. You already have an account, so nothing was created and nothing changed.</p><p>If it was you, <a href="${appOrigin()}/login">sign in</a> — or <a href="${appOrigin()}/forgot-password">reset your password</a> if you cannot get in.</p><p style="color:#6b7a71;font-size:12px">If it was not you, you can ignore this message.</p>`,
        });
      } catch (error) {
        console.error("[signup-existing-notice]", error);
      }
      return Response.json({ ok: true, pendingVerification: true });
    }

    const verificationToken = randomToken(24);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [created] = await db
      .insert(users)
      .values({
        name,
        email,
        company,
        phone: (body.phone ?? "").trim() || null,
        passwordHash: await hashPassword(password),
        verificationToken: digestToken(verificationToken),
        verificationExpires,
        emailVerified: false,
        accountTier: "retail",
      })
      .returning();

    if (!created) return Response.json({ error: "Could not create the account." }, { status: 500 });

    const verifyUrl = `${appOrigin()}/verify-email?token=${verificationToken}`;
    const template = verifyEmailTemplate(name, verifyUrl);
    const delivery = await sendEmail({ to: email, subject: template.subject, html: template.html });

    // No session here: signing the browser in would tell an attacker that the address was free,
    // and this store needs a verified e-mail before an order can be placed anyway.
    return Response.json({
      ok: true,
      pendingVerification: true,
      verificationSent: delivery.sent,
      devVerifyUrl: !delivery.sent && demoModeEnabled() ? verifyUrl : null,
    });
  } catch (error) {
    console.error("[signup]", error);
    return Response.json({ error: "Sign up failed. Please try again." }, { status: 500 });
  }
}
