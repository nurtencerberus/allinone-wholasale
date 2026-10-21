import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * `next build` imports every route to collect its configuration, so a missing
 * DATABASE_URL must not crash the build (fresh clones and CI have no database).
 * The pool never connects until the first query. If the variable is still missing
 * at runtime, queries fail and the cause is logged once, clearly.
 */
if (!databaseUrl && !isBuildPhase) {
  console.error(
    "[db] DATABASE_URL is not set — every database query will fail. Set it in your environment (see .env.example).",
  );
}

/** An unresolvable host makes the failure obvious instead of silently using localhost. */
const FALLBACK_URL = "postgresql://database-url-not-set.invalid:5432/missing";

/**
 * TLS is configured here rather than through `?sslmode=` in the URL.
 *
 * pg 8.23 warns on every process start that it treats `require` as `verify-full` today and will
 * adopt the weaker libpq meaning in pg 9 — and that warning goes to stderr, which means Vercel
 * files it under `level:error` on **every** function invocation and buries the real errors. Taking
 * the parameter out of the string and asking for certificate verification explicitly keeps exactly
 * today's behaviour (Neon's certificate is publicly trusted) without the warning and without a
 * silent weakening when pg 9 lands.
 */
export function poolConfigFor(url: string | undefined): PoolConfig {
  const connectionString = url?.trim() || FALLBACK_URL;
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return { connectionString };
  }

  const sslmode = parsed.searchParams.get("sslmode");
  parsed.searchParams.delete("sslmode");
  // libpq-only, ignored by pg, and it would be passed through as a startup parameter.
  parsed.searchParams.delete("channel_binding");

  const ssl =
    !sslmode || sslmode === "disable"
      ? undefined
      : sslmode === "no-verify"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  return { connectionString: parsed.toString(), ...(ssl ? { ssl } : {}) };
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    ...poolConfigFor(databaseUrl),
    // Serverless: many short-lived instances share one Neon pooler, so keep each pool small,
    // release idle connections quickly and fail fast instead of hanging on a cold database.
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    // Neon suspends an idle compute and the pooler drops quiet sockets; without keepalive the
    // pool hands out a connection that died minutes ago and the next query fails on it.
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
  });

/**
 * An idle client failing is normal here (a suspended Neon compute, a dropped socket). pg emits it
 * on the pool, and with no listener Node treats it as an unhandled error and takes the invocation
 * down with it. The pool has already discarded the client by this point; logging is the whole job.
 */
pool.on("error", (error) => {
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "warn",
      alert: "db-idle-client",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
});

/**
 * One retry for a **read** that died on a broken connection.
 *
 * Production logs showed `Connection terminated unexpectedly` while the catalogue cache was
 * revalidating: Neon had suspended the compute, so the first query through a stale socket failed
 * and the page fell back to an empty catalogue. A second attempt gets a fresh connection.
 *
 * Only single SELECT statements are retried. A write could have been applied before the socket
 * died, and a transaction takes its own client through `pool.connect()` and never reaches this —
 * which is the boundary we want: nothing that could double-apply is ever repeated.
 */
const TRANSIENT = /Connection terminated|connection timeout|ECONNRESET|socket hang up|server closed the connection/i;

function isRetryableRead(sql: unknown): boolean {
  const text = typeof sql === "string" ? sql : typeof sql === "object" && sql !== null ? (sql as { text?: string }).text : undefined;
  return typeof text === "string" && /^\s*(select|with)\b/i.test(text);
}

type PoolQuery = typeof pool.query;
const query = pool.query.bind(pool) as PoolQuery;
pool.query = (async (...args: Parameters<PoolQuery>) => {
  try {
    return await (query as (...a: Parameters<PoolQuery>) => Promise<unknown>)(...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isRetryableRead(args[0]) || !TRANSIENT.test(message)) throw error;
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        level: "warn",
        alert: "db-retry",
        message,
      }),
    );
    return await (query as (...a: Parameters<PoolQuery>) => Promise<unknown>)(...args);
  }
}) as PoolQuery;

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
