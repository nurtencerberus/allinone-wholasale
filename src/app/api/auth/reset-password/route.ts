import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";

    if (!token) return Response.json({ error: "Reset token missing." }, { status: 400 });
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.resetToken, token), gt(users.resetExpires, new Date())))
      .limit(1);

    if (!user) {
      return Response.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(password), resetToken: null, resetExpires: null })
      .where(eq(users.id, user.id));

    // Invalidate every existing session for the account.
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    return Response.json({ ok: true, email: user.email });
  } catch (error) {
    console.error("[reset-password]", error);
    return Response.json({ error: "Password reset failed." }, { status: 500 });
  }
}
