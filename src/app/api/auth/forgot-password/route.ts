import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { digestToken, randomToken } from "@/lib/password";
import { appOrigin } from "@/lib/site";
import { resetPasswordTemplate, sendEmail } from "@/lib/email";
import { demoModeEnabled } from "@/lib/demo-mode";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const ipLimit = await consumeRateLimit("forgot-ip", clientIp(request), 20, 3600);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const body = (await request.json()) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return Response.json({ error: "Email is required." }, { status: 400 });
    const emailLimit = await consumeRateLimit("forgot-email", email, 5, 3600);
    if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterSeconds);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      // Do not disclose whether the address exists.
      return Response.json({
        ok: true,
        message: "If that email is on file, a reset link is on its way.",
        devResetUrl: null,
      });
    }

    const token = randomToken(24);
    await db
      .update(users)
      .set({ resetToken: digestToken(token), resetExpires: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(users.id, user.id));

    const url = `${appOrigin()}/reset-password?token=${token}`;
    const template = resetPasswordTemplate(url);
    const delivery = await sendEmail({ to: user.email, subject: template.subject, html: template.html });

    return Response.json({
      ok: true,
      message: "If that email is on file, a reset link is on its way.",
      devResetUrl: !delivery.sent && demoModeEnabled() ? url : null,
    });
  } catch (error) {
    console.error("[forgot-password]", error);
    return Response.json({ error: "Could not start the reset process." }, { status: 500 });
  }
}
