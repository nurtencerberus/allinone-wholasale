import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { digestToken, hashPassword } from "@/lib/password";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit("reset-ip", clientIp(request), 20, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as { token?: string; password?: string };
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";

    if (!token) return Response.json({ error: "Reset token missing." }, { status: 400 });
    if (password.length < 8 || password.length > 256) {
      return Response.json({ error: "Password must be 8–256 characters." }, { status: 400 });
    }

    // Consume the token in the same statement that sets the password: two concurrent
    // requests with one link cannot both succeed.
    const [user] = await db
      .update(users)
      .set({ passwordHash: hashPassword(password), resetToken: null, resetExpires: null })
      .where(and(eq(users.resetToken, digestToken(token)), gt(users.resetExpires, new Date())))
      .returning({ id: users.id, email: users.email });

    if (!user) {
      return Response.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    // Invalidate every existing session for the account.
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    return Response.json({ ok: true, email: user.email });
  } catch (error) {
    console.error("[reset-password]", error);
    return Response.json({ error: "Password reset failed." }, { status: 500 });
  }
}
