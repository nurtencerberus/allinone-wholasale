import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, toSessionUser } from "@/lib/auth";
import { hashPassword, randomToken } from "@/lib/password";
import { sendEmail, verifyEmailTemplate } from "@/lib/email";
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
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return Response.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 },
      );
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
        passwordHash: hashPassword(password),
        verificationToken,
        verificationExpires,
        emailVerified: false,
        accountTier: "retail",
      })
      .returning();

    if (!created) return Response.json({ error: "Could not create the account." }, { status: 500 });

    await createSession(created.id);

    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;
    const template = verifyEmailTemplate(name, verifyUrl);
    const delivery = await sendEmail({ to: email, subject: template.subject, html: template.html });

    return Response.json({
      ok: true,
      user: toSessionUser(created),
      verificationSent: delivery.sent,
      devVerifyUrl: !delivery.sent && demoModeEnabled() ? verifyUrl : null,
    });
  } catch (error) {
    console.error("[signup]", error);
    return Response.json({ error: "Sign up failed. Please try again." }, { status: 500 });
  }
}
