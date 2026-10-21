import { describe, expect, it } from "vitest";
import { poolConfigFor } from "@/db";

/**
 * The connection string is rewritten before it reaches pg: `sslmode` becomes an explicit TLS
 * setting (see the comment in src/db/index.ts) and the libpq-only parameters are dropped.
 */
describe("poolConfigFor", () => {
  it("turns Neon's sslmode=require into certificate verification", () => {
    const config = poolConfigFor(
      "postgresql://user:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(String(config.connectionString)).not.toContain("sslmode");
    expect(String(config.connectionString)).not.toContain("channel_binding");
    expect(String(config.connectionString)).toContain("ep-x-pooler.us-east-2.aws.neon.tech");
  });

  it("keeps verify-full semantics for the stricter modes", () => {
    for (const mode of ["verify-full", "verify-ca", "prefer"]) {
      expect(poolConfigFor(`postgres://h/db?sslmode=${mode}`).ssl).toEqual({ rejectUnauthorized: true });
    }
  });

  it("allows an unverified certificate only when asked for one", () => {
    expect(poolConfigFor("postgres://h/db?sslmode=no-verify").ssl).toEqual({ rejectUnauthorized: false });
  });

  it("leaves a local database without TLS", () => {
    expect(poolConfigFor("postgresql://postgres@localhost:5432/app").ssl).toBeUndefined();
    expect(poolConfigFor("postgresql://postgres@localhost:5432/app?sslmode=disable").ssl).toBeUndefined();
  });

  it("keeps the other query parameters", () => {
    const config = poolConfigFor("postgres://h/db?sslmode=require&application_name=ciputra");
    expect(String(config.connectionString)).toContain("application_name=ciputra");
  });

  it("falls back to an obviously invalid host when the variable is missing", () => {
    for (const value of [undefined, "", "   "]) {
      expect(String(poolConfigFor(value).connectionString)).toContain("database-url-not-set.invalid");
    }
  });

  it("passes something unparseable through untouched rather than guessing", () => {
    expect(poolConfigFor("not a url").connectionString).toBe("not a url");
  });
});
