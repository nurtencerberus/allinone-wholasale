import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { digestToken } from "@/lib/password";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit("verify-ip", clientIp(request), 30, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as { token?: string };
    const token = (body.token ?? "").trim();
    if (!token) return Response.json({ error: "Verification token missing." }, { status: 400 });

    const [user] = await db
      .update(users)
      .set({ emailVerified: true, verificationToken: null, verificationExpires: null })
      .where(and(eq(users.verificationToken, digestToken(token)), gt(users.verificationExpires, new Date())))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    if (!user) {
      return Response.json(
        { error: "This link is invalid or has expired. Request a fresh confirmation email." },
        { status: 400 },
      );
    }

    // Signing up no longer signs the browser in (KYT-8), so following the link from the inbox
    // is what finishes the job — for a customer. Staff still sign in with a password and TOTP.
    if (user.role === "customer") await createSession(user.id);

    return Response.json({ ok: true, email: user.email, name: user.name, signedIn: user.role === "customer" });
  } catch (error) {
    console.error("[verify]", error);
    return Response.json({ error: "Verification failed." }, { status: 500 });
  }
}
