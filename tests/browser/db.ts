import { createHmac } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";

/**
 * Database access for the browser tests. Same contract as tests/e2e/lib.mjs: a disposable test
 * database seeded in demo mode, and a refusal to touch anything that looks hosted.
 */
const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set E2E_DATABASE_URL (or DATABASE_URL) to the test database.");
if (/neon\.tech|pooler/.test(url) && !process.env.E2E_ALLOW_REMOTE) {
  throw new Error("Refusing to run browser tests against what looks like a hosted database.");
}

export const pool = new Pool({
  connectionString: url,
  max: 3,
  idleTimeoutMillis: 500,
  // Let the Playwright worker exit without waiting for an idle client to time out.
  allowExitOnIdle: true,
});

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

/** Signing in repeatedly would otherwise walk into the login rate limit. */
export async function clearRateLimits(): Promise<void> {
  await q("delete from rate_limits");
}

export type TestProduct = {
  id: number;
  slug: string;
  name: string;
  casePrice: number;
  caseSize: number;
  minCases: number;
};

/**
 * A product the browser can buy: active, taxable in NJ (so the tax row has something to show)
 * and stocked from one long-dated lot, because stock only moves through lots (SEP/STK rules).
 */
export async function stockedProduct(cases = 400): Promise<TestProduct> {
  const [row] = await q<{
    id: number;
    slug: string;
    name: string;
    case_price: number;
    case_size: number;
    min_cases: number;
  }>(
    `select id, slug, name, case_price, case_size, min_cases
       from products
      where active and tax_class = 'general' and case_price > 0
      order by case_price desc
      limit 1`,
  );
  if (!row) throw new Error("The demo catalog has no active general-tax product to buy.");
  await setStock(row.id, cases);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    casePrice: row.case_price,
    caseSize: row.case_size,
    minCases: row.min_cases,
  };
}

/** Mirrors setStock() in tests/e2e/lib.mjs: empty the lots, then one lot holds everything. */
export async function setStock(productId: number, cases: number): Promise<void> {
  await q("update product_lots set qty_on_hand = 0 where product_id = $1", [productId]);
  await q(
    `insert into product_lots (product_id, lot_number, expires_on, qty_received, qty_on_hand)
     values ($1, 'BROWSER-LOT', current_date + 400, $2, $2)
     on conflict (product_id, lot_number) do update set qty_on_hand = $2, status = 'available'`,
    [productId, cases],
  );
  await q("update products set stock = $2 where id = $1", [productId, cases]);
}

/** RFC 6238 code for a base32 secret, as an authenticator app would show it. */
export function totpCode(secret: string, offsetSteps = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code =
    ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
