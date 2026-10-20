// UX-7: a negotiated price replaces list and tier pricing for that account, is never discounted
// twice, honours its own minimum and its window, and cannot be claimed by the browser.
import { randomUUID } from "node:crypto";
import { Client, check, done, q, setStock } from "./lib.mjs";

await q("delete from rate_limits");
const buyer = new Client();
let r = await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
check("wholesale buyer login", r.status === 200, r.text.slice(0, 120));
const admin = new Client();
r = await admin.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" });
check("admin login", r.status === 200, r.text.slice(0, 120));

const [account] = await q("select id from users where email='buyer@harborhouse.com'");
const [product] = await q(
  "select id, sku, case_price, min_cases from products where active and tax_class='general' order by case_price desc limit 1",
);
await setStock(product.id, 500);
await q("delete from account_prices where user_id=$1", [account.id]);
await q("update users set wholesale_discount_pct = 10 where id=$1", [account.id]);

const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const cases = Math.max(product.min_cases, Math.ceil(200_000 / product.case_price));
const quote = () => buyer.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });
const lineOf = (res) => res.json?.quote?.lines?.[0];

// --- without an agreed price: list minus the account's percentage ------------------------------
r = await quote();
const plain = lineOf(r);
check(
  "a trade account pays list less its contract percentage",
  plain && plain.casePrice === Math.round(plain.listCasePrice * 0.9) && plain.priceSource !== "contract",
  JSON.stringify(plain && { list: plain.listCasePrice, paid: plain.casePrice, source: plain.priceSource }),
);

// --- with an agreed price ----------------------------------------------------------------------
const agreed = Math.round(product.case_price * 0.7);
r = await admin.req("PUT", `/api/admin/accounts/${account.id}/prices`, {
  productId: product.id,
  casePrice: agreed / 100,
});
check("the trade desk can agree a price", r.status === 200, r.text.slice(0, 160));

r = await quote();
const priced = lineOf(r);
check(
  "the agreed price is what the buyer pays",
  priced && priced.casePrice === agreed && priced.priceSource === "contract",
  JSON.stringify(priced && { paid: priced.casePrice, agreed, source: priced.priceSource }),
);
check(
  "the percentage discount is not applied on top of it",
  priced && priced.casePrice === agreed && priced.casePrice !== Math.round(agreed * 0.9),
  `${priced?.casePrice} vs ${Math.round(agreed * 0.9)}`,
);
check("the saving is reported against the catalogue price", priced && priced.accountSaving === (product.case_price - agreed) * cases, JSON.stringify(priced?.accountSaving));

// --- the agreed minimum --------------------------------------------------------------------------
await q("update account_prices set min_cases = $2 where user_id=$1", [account.id, cases + 5]);
r = await quote();
check(
  "below the agreed minimum the buyer falls back to normal pricing",
  lineOf(r)?.priceSource !== "contract",
  JSON.stringify(lineOf(r)?.priceSource),
);
await q("update account_prices set min_cases = null where user_id=$1", [account.id]);

// --- the window ------------------------------------------------------------------------------
await q("update account_prices set expires_at = now() - interval '1 day' where user_id=$1", [account.id]);
r = await quote();
check("an expired agreement is not used", lineOf(r)?.priceSource !== "contract");
await q("update account_prices set expires_at = null, starts_at = now() + interval '2 days' where user_id=$1", [account.id]);
r = await quote();
check("an agreement that has not started is not used", lineOf(r)?.priceSource !== "contract");
await q("update account_prices set starts_at = null where user_id=$1", [account.id]);

// --- it belongs to one account ------------------------------------------------------------------
const other = new Client();
await other.post("/api/auth/login", { email: "customer@example.com", password: "Customer123!" });
r = await other.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });
check("another account does not get someone else's price", r.status === 403 || lineOf(r)?.casePrice !== agreed, r.text.slice(0, 120));

// --- the order is written at the agreed price ----------------------------------------------------
const priceQuote = await quote();
r = await buyer.post("/api/orders", {
  items: [{ productId: product.id, cases }],
  address: NJ,
  shippingOptionId: priceQuote.json.quote.shippingOptionId,
  checkoutId: randomUUID(),
  email: "buyer@harborhouse.com",
  name: "Dana Whitfield",
  company: "Harbor House",
  phone: "2075550184",
  paymentMethod: "ach",
});
check("the order is placed", r.status === 200 && r.json.orderNumber, r.text.slice(0, 160));
const [line] = await q(
  `select i.unit_price, i.line_total, i.cases from order_items i
     join orders o on o.id = i.order_id where o.order_number = $1`,
  [r.json?.orderNumber],
);
check(
  "the order line carries the agreed price, not the list price",
  line && line.line_total === agreed * line.cases,
  JSON.stringify(line),
);

// --- the browser cannot claim a price -------------------------------------------------------------
await q("delete from account_prices where user_id=$1", [account.id]);
r = await buyer.post("/api/checkout/quote", {
  items: [{ productId: product.id, cases, casePrice: 1 }],
  address: NJ,
});
check("a price sent by the browser is ignored", lineOf(r)?.casePrice !== 1 && lineOf(r)?.casePrice > 0, JSON.stringify(lineOf(r)?.casePrice));

await q("update users set wholesale_discount_pct = 0 where id=$1", [account.id]);
await done();
