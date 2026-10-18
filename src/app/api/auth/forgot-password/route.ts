import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { randomToken } from "@/lib/password";
import { resetPasswordTemplate, sendEmail } from "@/lib/email";
import { ensureSeeded } from "@/lib/seed";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return Response.json({ error: "Email is required." }, { status: 400 });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const origin = new URL(request.url).origin;

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
      .set({ resetToken: token, resetExpires: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(users.id, user.id));

    const url = `${origin}/reset-password?token=${token}`;
    const template = resetPasswordTemplate(url);
    const delivery = await sendEmail({ to: user.email, subject: template.subject, html: template.html });

    return Response.json({
      ok: true,
      message: "If that email is on file, a reset link is on its way.",
      deliverySent: delivery.sent,
      devResetUrl: delivery.sent ? null : url,
    });
  } catch (error) {
    console.error("[forgot-password]", error);
    return Response.json({ error: "Could not start the reset process." }, { status: 500 });
  }
}
