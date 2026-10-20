// UX-7: the request-for-quote round trip — buyer asks, desk prices, buyer accepts, and the
// agreed prices are what the next order is charged at.
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
await q("delete from quote_requests where user_id=$1", [account.id]);
await q("delete from account_prices where user_id=$1", [account.id]);
await q("update users set wholesale_discount_pct = 10 where id=$1", [account.id]);

const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const cases = Math.max(product.min_cases, Math.ceil(200_000 / product.case_price));

// --- a quote carries prices, so only a trade account may ask ---------------------------------
const guest = new Client();
r = await guest.post("/api/quotes", { items: [{ productId: product.id, cases }] });
check("a guest cannot ask for a quote", r.status === 403, String(r.status));

// --- the buyer asks ----------------------------------------------------------------------------
r = await buyer.post("/api/quotes", { items: [{ productId: product.id, cases }], note: "Annual restock" });
check("the buyer can ask for a price", r.status === 200 && /^RFQ-\d{6}$/.test(r.json.reference ?? ""), r.text.slice(0, 160));
const quoteId = r.json.id;

r = await buyer.post("/api/quotes", { items: [{ productId: product.id, cases }] });
check("only one open request at a time", r.status === 409 && /already have an open request/i.test(r.json.error), r.text.slice(0, 140));

// --- the desk prices it --------------------------------------------------------------------------
const [item] = await q("select id from quote_items where quote_id=$1", [quoteId]);
const agreed = Math.round(product.case_price * 0.65);
r = await admin.req("PATCH", `/api/admin/quotes/${quoteId}`, { action: "send", validDays: 10, note: "Freight quoted at checkout" });
check("a quote cannot go out unpriced", r.status === 400, r.text.slice(0, 140));

r = await admin.req("PATCH", `/api/admin/quotes/${quoteId}`, {
  action: "send",
  validDays: 10,
  prices: [{ quoteItemId: item.id, casePrice: agreed }],
});
check("the desk sends the quote", r.status === 200, r.text.slice(0, 160));
const [sent] = await q("select status, expires_at from quote_requests where id=$1", [quoteId]);
check("it is marked as quoted with a deadline", sent.status === "quoted" && sent.expires_at, JSON.stringify(sent));

// --- a quote is nobody else's business ------------------------------------------------------------
const other = new Client();
await other.post("/api/auth/login", { email: "customer@example.com", password: "Customer123!" });
r = await other.req("PATCH", `/api/quotes/${quoteId}`, { action: "accept" });
check("another account cannot accept it", r.status === 403, String(r.status));

// --- before accepting, the buyer still pays list minus their percentage ---------------------------
const quote = () => buyer.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });
r = await quote();
check("prices do not change until the quote is accepted", r.json?.quote?.lines?.[0]?.priceSource !== "contract", JSON.stringify(r.json?.quote?.lines?.[0]?.priceSource));

// --- the buyer accepts -----------------------------------------------------------------------------
r = await buyer.req("PATCH", `/api/quotes/${quoteId}`, { action: "accept" });
check("the buyer accepts the quote", r.status === 200, r.text.slice(0, 160));
const prices = await q("select product_id, case_price, min_cases, expires_at from account_prices where user_id=$1", [account.id]);
check(
  "accepting writes the agreed price onto the account",
  prices.length === 1 && prices[0].case_price === agreed && prices[0].min_cases === cases && prices[0].expires_at,
  JSON.stringify(prices),
);

r = await quote();
const line = r.json?.quote?.lines?.[0];
check("the next quote is priced from the accepted agreement", line?.casePrice === agreed && line?.priceSource === "contract", JSON.stringify(line && { paid: line.casePrice, agreed, source: line.priceSource }));

// --- and the order is charged at it -------------------------------------------------------------------
const priced = await quote();
r = await buyer.post("/api/orders", {
  items: [{ productId: product.id, cases }],
  address: NJ,
  shippingOptionId: priced.json.quote.shippingOptionId,
  checkoutId: randomUUID(),
  email: "buyer@harborhouse.com",
  name: "Dana Whitfield",
  company: "Harbor House",
  phone: "2075550184",
  paymentMethod: "ach",
});
check("the order goes through", r.status === 200 && r.json.orderNumber, r.text.slice(0, 160));
const [ordered] = await q(
  `select i.line_total, i.cases from order_items i join orders o on o.id = i.order_id where o.order_number=$1`,
  [r.json?.orderNumber],
);
check("the order line carries the quoted price", ordered && ordered.line_total === agreed * ordered.cases, JSON.stringify(ordered));

// --- an accepted quote is closed -----------------------------------------------------------------------
r = await buyer.req("PATCH", `/api/quotes/${quoteId}`, { action: "accept" });
check("an accepted quote cannot be accepted twice", r.status === 409, r.text.slice(0, 140));

// --- expiry ----------------------------------------------------------------------------------------------
await q("delete from account_prices where user_id=$1", [account.id]);
await q("delete from quote_requests where user_id=$1", [account.id]);
r = await buyer.post("/api/quotes", { items: [{ productId: product.id, cases }] });
const secondId = r.json.id;
const [secondItem] = await q("select id from quote_items where quote_id=$1", [secondId]);
await admin.req("PATCH", `/api/admin/quotes/${secondId}`, {
  action: "send",
  validDays: 5,
  prices: [{ quoteItemId: secondItem.id, casePrice: agreed }],
});
await q("update quote_requests set expires_at = now() - interval '1 day' where id=$1", [secondId]);
r = await buyer.req("PATCH", `/api/quotes/${secondId}`, { action: "accept" });
check("an expired quote cannot be accepted", r.status === 409 && /expired/i.test(r.json.error), r.text.slice(0, 140));

const cron = await (await fetch(`${process.env.BASE ?? "http://localhost:3000"}/api/cron/maintenance`, { headers: { authorization: "Bearer testcronsecret" } })).json();
const [afterCron] = await q("select status from quote_requests where id=$1", [secondId]);
check("the nightly job marks it expired", afterCron.status === "expired" && Array.isArray(cron.quotesExpired), JSON.stringify({ status: afterCron.status, cron: cron.quotesExpired }));

await q("update users set wholesale_discount_pct = 0 where id=$1", [account.id]);
await q("delete from quote_requests where user_id=$1", [account.id]);
await done();
