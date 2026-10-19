// Shared helpers for the end-to-end suites. They run against a live server (BASE) backed by a
// disposable Postgres (DATABASE_URL) seeded in demo mode — never against production.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

export const BASE = process.env.BASE ?? "http://localhost:3000";
const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set E2E_DATABASE_URL (or DATABASE_URL) to the test database.");
if (/neon\.tech|pooler/.test(url) && !process.env.E2E_ALLOW_REMOTE) {
  throw new Error("Refusing to run e2e tests against what looks like a hosted database.");
}
export const pool = new Pool({ connectionString: url });
export const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  — ${detail}` : ""}`);
}
export function done() {
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  return pool.end().then(() => process.exit(failures ? 1 : 0));
}

/** Minimal cookie-jar HTTP client. */
export class Client {
  constructor() { this.jar = new Map(); }
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), cookie: this.cookie(), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [k, ...rest] = pair.split("=");
      const v = rest.join("=");
      if (!v) this.jar.delete(k); else this.jar.set(k, v);
    }
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, json, text };
  }
  post(path, body, headers) { return this.req("POST", path, body ?? {}, headers); }
  get(path) { return this.req("GET", path); }
}

export const uniq = () => Math.random().toString(36).slice(2, 8);
