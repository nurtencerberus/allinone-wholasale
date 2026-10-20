import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness for uptime monitoring (DEV-3). 200 means this instance can reach the database;
 * 503 means it cannot, which is what a monitor should page on. No configuration is reported.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up", ms: Date.now() - started });
  } catch (error) {
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        level: "error",
        alert: "health-db-down",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
