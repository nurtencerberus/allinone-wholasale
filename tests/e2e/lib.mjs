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
    // FormData goes through untouched so fetch can set its own multipart boundary; everything
    // else is JSON, which is also what the cross-site guard in src/proxy.ts expects.
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const response = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        cookie: this.cookie(),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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

/**
 * Stock lives in lots (src/lib/inventory.ts). Tests set it by emptying the product's lots and
 * putting everything into one long-dated test lot, keeping products.stock in step.
 */
export async function setStock(productId, cases) {
  await q("update product_lots set qty_on_hand = 0 where product_id = $1", [productId]);
  await q(
    `insert into product_lots (product_id, lot_number, expires_on, qty_received, qty_on_hand)
     values ($1, 'E2E-LOT', current_date + 400, $2, $2)
     on conflict (product_id, lot_number) do update set qty_on_hand = $2, status = 'available'`,
    [productId, cases],
  );
  await q("update products set stock = $2 where id = $1", [productId, cases]);
}

/** RFC 6238 code for a base32 secret, as an authenticator app would show it. */
export async function totp(secret, offsetSteps = 0) {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret.replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const o = hmac[hmac.length - 1] & 15;
  const code = ((hmac[o] & 127) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
