import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    // An unresolvable host makes the failure obvious instead of silently using localhost.
    connectionString: databaseUrl ?? "postgresql://database-url-not-set.invalid:5432/missing",
    // Serverless: many short-lived instances share one Neon pooler, so keep each pool small,
    // release idle connections quickly and fail fast instead of hanging on a cold database.
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
