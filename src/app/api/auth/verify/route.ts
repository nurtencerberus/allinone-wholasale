import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = (body.token ?? "").trim();
    if (!token) return Response.json({ error: "Verification token missing." }, { status: 400 });

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.verificationToken, token), gt(users.verificationExpires, new Date())))
      .limit(1);

    if (!user) {
      return Response.json(
        { error: "This link is invalid or has expired. Request a fresh confirmation email." },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({ emailVerified: true, verificationToken: null, verificationExpires: null })
      .where(eq(users.id, user.id));

    return Response.json({ ok: true, email: user.email, name: user.name });
  } catch (error) {
    console.error("[verify]", error);
    return Response.json({ error: "Verification failed." }, { status: 500 });
  }
}
