import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, toSessionUser } from "@/lib/auth";
import { verifyPasswordOrDummy } from "@/lib/password";
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

    const ip = clientIp(request);
    const ipLimit = await consumeRateLimit("login-ip", ip, 30, 900);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    // Tight per account+IP, loose per account: one attacker cannot lock the real owner out
    // from their own network, but a distributed guess against one account is still capped.
    const pairLimit = await consumeRateLimit("login-account-ip", `${email}|${ip}`, 10, 900);
    if (!pairLimit.allowed) return tooManyRequests(pairLimit.retryAfterSeconds);
    const accountLimit = await consumeRateLimit("login-account", email, 50, 900);
    if (!accountLimit.allowed) return tooManyRequests(accountLimit.retryAfterSeconds);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!verifyPasswordOrDummy(password, user?.passwordHash) || !user) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user.id);
    return Response.json({ ok: true, user: toSessionUser(user) });
  } catch (error) {
    console.error("[login]", error);
    return Response.json({ error: "Sign in failed. Please try again." }, { status: 500 });
  }
}
