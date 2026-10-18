import { sql } from "drizzle-orm";
import { db } from "@/db";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter stored in Postgres, so every serverless instance shares
 * one counter (an in-memory Map would reset on each cold start and is per-instance).
 */
export async function consumeRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const id = `${scope}:${key}`.toLowerCase().slice(0, 200);
  const result = await db.execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${id}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE
        WHEN rate_limits.reset_at <= now() THEN now() + make_interval(secs => ${windowSeconds})
        ELSE rate_limits.reset_at
      END
    RETURNING count, reset_at
  `);

  const row = result.rows[0];
  if (!row) return { allowed: true, retryAfterSeconds: 0 };
  const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { allowed: Number(row.count) <= limit, retryAfterSeconds };
}

/** Best-effort client address. On Vercel the first x-forwarded-for entry is the client. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
