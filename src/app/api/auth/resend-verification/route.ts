import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { randomToken } from "@/lib/password";
import { sendEmail, verifyEmailTemplate } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

    const [user] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
    if (user.emailVerified) return Response.json({ ok: true, alreadyVerified: true });

    const token = randomToken(24);
    await db
      .update(users)
      .set({ verificationToken: token, verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .where(eq(users.id, user.id));

    const origin = new URL(request.url).origin;
    const url = `${origin}/verify-email?token=${token}`;
    const template = verifyEmailTemplate(user.name, url);
    const delivery = await sendEmail({ to: user.email, subject: template.subject, html: template.html });

    return Response.json({
      ok: true,
      deliverySent: delivery.sent,
      devVerifyUrl: delivery.sent ? null : url,
    });
  } catch (error) {
    console.error("[resend-verification]", error);
    return Response.json({ error: "Could not resend the confirmation." }, { status: 500 });
  }
}
