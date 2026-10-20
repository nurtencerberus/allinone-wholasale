import { Client, check, done, q, uniq } from "./lib.mjs";
await q("delete from rate_limits");
const [p] = await q("select id, slug, case_price, price_tiers from products where active order by id limit 1");
const money = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const secrets = [money(p.case_price), `"casePrice":${p.case_price}`, `casePrice\\":${p.case_price}`, ...(p.price_tiers ?? []).map((t) => money(t.casePrice))];
const leaks = (html) => secrets.filter((x) => html.includes(x));

const anon = new Client();
const retail = new Client();
const email = `retail-${uniq()}@shop.com`;
await retail.post("/api/auth/signup", { name: "Retail", email, password: "Passw0rd!x" });
const buyer = new Client();
await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });

for (const [who, c] of [["anonymous", anon], ["signed-in, not approved", retail]]) {
  for (const path of ["/", "/shop", `/products/${p.slug}`, "/shop?sort=price-asc", "/quick-order", "/checkout"]) {
    const r = await c.get(path);
    check(`${who} ${path}: no wholesale price in HTML/RSC`, leaks(r.text).length === 0, leaks(r.text).join(" | "));
  }
  for (const [method, path, body] of [
    ["POST", "/api/checkout/quote", { items: [{ productId: p.id, cases: 5 }] }],
    ["POST", "/api/checkout/payment-intent", { items: [{ productId: p.id, cases: 5 }] }],
    ["POST", "/api/orders", { items: [{ productId: p.id, cases: 5 }] }],
    ["POST", "/api/quick-order", { raw: "X 1" }],
    ["GET", "/api/order-sheet/download?format=csv"],
  ]) {
    const r = method === "GET" ? await c.get(path) : await c.post(path, body);
    check(`${who} ${method} ${path} → 403`, r.status === 403, String(r.status));
  }
  const [list] = await q("select id from wholesale_lists where published limit 1");
  if (list) {
    const r = await c.get(`/api/wholesale-lists/${list.id}/download`);
    check(`${who} supplier list download → 403`, r.status === 403, String(r.status));
  }
}

let r = await buyer.get(`/products/${p.slug}`);
check("approved buyer sees the case price", r.text.includes(money(p.case_price)));
r = await buyer.get("/shop");
check("approved buyer sees prices on shop", r.text.includes(money(p.case_price)));
r = await buyer.post("/api/checkout/quote", { items: [{ productId: p.id, cases: 5 }] });
check("approved buyer can quote", r.status === 200, String(r.status));
r = await anon.get(`/products/${p.slug}`);
check("product JSON-LD has no Offer/price", !/"@type":"Offer"/.test(r.text) && !/"price":"/.test(r.text));
check("meta description has no price", !/<meta name="description" content="[^"]*\$\d/.test(r.text));
// --- catalogue cache (PRF-1) ------------------------------------------------------------------
// Rows are cached, rendered HTML is not: the very same catalogue must stay priceless for a guest
// and priced for a trade account, however many times it has been served from the cache.
r = await anon.get("/shop");
check("the cached catalogue stays price-locked for a guest", !r.text.includes(money(p.case_price)), "a guest saw a price on /shop");
r = await buyer.get("/shop");
check("the same cached catalogue shows prices to a trade account", r.text.includes(money(p.case_price)));
r = await anon.get("/shop");
check("still price-locked on a second, certainly cached read", !r.text.includes(money(p.case_price)));

await done();
