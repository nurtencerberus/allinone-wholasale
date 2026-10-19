import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
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
      .returning({ email: users.email, name: users.name });

    if (!user) {
      return Response.json(
        { error: "This link is invalid or has expired. Request a fresh confirmation email." },
        { status: 400 },
      );
    }

    return Response.json({ ok: true, email: user.email, name: user.name });
  } catch (error) {
    console.error("[verify]", error);
    return Response.json({ error: "Verification failed." }, { status: 500 });
  }
}
