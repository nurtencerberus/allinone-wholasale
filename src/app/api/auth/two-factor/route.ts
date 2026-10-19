import { createSession, toSessionUser } from "@/lib/auth";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { completeLoginChallenge } from "@/lib/two-factor";

export const runtime = "nodejs";

/** Second step of sign-in: a code from the authenticator app or a recovery code. */
export async function POST(request: Request) {
  try {
    const limit = await consumeRateLimit("login-2fa-ip", clientIp(request), 30, 900);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const code = String(body.code ?? "").slice(0, 40);
    if (!code.trim()) return Response.json({ error: "Enter the code from your authenticator app." }, { status: 400 });

    const result = await completeLoginChallenge(code);
    if (!result.ok) {
      return Response.json({ error: result.error, restart: Boolean(result.restart) }, { status: 401 });
    }
    await createSession(result.user.id);
    return Response.json({
      ok: true,
      user: toSessionUser(result.user),
      remainingRecoveryCodes: result.usedRecoveryCode ? result.user.recoveryCodes.length - 1 : undefined,
    });
  } catch (error) {
    console.error("[login-2fa]", error);
    return Response.json({ error: "Sign in failed. Please try again." }, { status: 500 });
  }
}
