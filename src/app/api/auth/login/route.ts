import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, toSessionUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

    const ipLimit = await consumeRateLimit("login-ip", clientIp(request), 30, 900);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const accountLimit = await consumeRateLimit("login-account", email, 10, 900);
    if (!accountLimit.allowed) return tooManyRequests(accountLimit.retryAfterSeconds);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user.id);
    return Response.json({ ok: true, user: toSessionUser(user) });
  } catch (error) {
    console.error("[login]", error);
    return Response.json({ error: "Sign in failed. Please try again." }, { status: 500 });
  }
}
