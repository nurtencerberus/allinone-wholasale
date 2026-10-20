// UX-7: company accounts — invite a colleague, share the terms, the agreed prices, the quotes
// and the order history, and keep every other account out of it.
import { randomUUID } from "node:crypto";
import { Client, check, done, q, setStock, uniq } from "./lib.mjs";

await q("delete from rate_limits");
const owner = new Client();
let r = await owner.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
check("trade buyer login", r.status === 200, r.text.slice(0, 120));
const admin = new Client();
await admin.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" });

const [ownerRow] = await q("select id from users where email='buyer@harborhouse.com'");
await q("update users set company_id = null, company_role = null where id=$1", [ownerRow.id]);
await q("delete from companies");
await q("update users set wholesale_discount_pct = 10 where id=$1", [ownerRow.id]);

// --- a single account becomes a company ---------------------------------------------------------
r = await owner.post("/api/company", { action: "create", name: "Harbor House Provisions" });
check("the buyer creates a company account", r.status === 200 && r.json.company?.id, r.text.slice(0, 160));
const companyId = r.json.company.id;
const [afterCreate] = await q("select company_id, company_role, wholesale_discount_pct from users where id=$1", [ownerRow.id]);
check(
  "the creator becomes the owner and keeps their terms",
  afterCreate.company_id === companyId && afterCreate.company_role === "owner" && afterCreate.wholesale_discount_pct === 10,
  JSON.stringify(afterCreate),
);
r = await owner.post("/api/company", { action: "create", name: "Second Try" });
check("one company per account", r.status === 409, r.text.slice(0, 120));

// --- invite a colleague ---------------------------------------------------------------------------
const mateEmail = `mate-${uniq()}@harborhouse.com`;
r = await owner.post("/api/auth/signup", { name: "Sam Mate", email: mateEmail, password: "Colleague123!" });
check("the colleague has an account", r.status === 200 || r.status === 201, r.text.slice(0, 140));
await q("update users set email_verified = true where email=$1", [mateEmail]);

r = await owner.post("/api/company", { action: "invite", email: mateEmail, role: "buyer" });
check("the owner invites them", r.status === 200, r.text.slice(0, 160));
const [invite] = await q("select token_digest, company_role from company_invites where email=$1", [mateEmail]);
check("only the digest of the invitation token is stored", invite && invite.token_digest.length === 64, JSON.stringify(invite));

// The e-mail carries the token; the demo answer exposes it so the suite can follow the link.
const inviteUrl = r.json.inviteUrl ?? "";
const token = inviteUrl.split("token=")[1] ?? "";
check("the demo answer carries the link to follow", token.length > 20, inviteUrl);

const mate = new Client();
await mate.post("/api/auth/login", { email: mateEmail, password: "Colleague123!" });

// --- the invitation is tied to one address ----------------------------------------------------------
const stranger = new Client();
await stranger.post("/api/auth/login", { email: "customer@example.com", password: "Customer123!" });
r = await stranger.post("/api/company", { action: "accept", token });
check("a forwarded invitation does not work for someone else", r.status === 403, r.text.slice(0, 140));

r = await mate.post("/api/company", { action: "accept", token });
check("the invited colleague joins", r.status === 200, r.text.slice(0, 160));
const [mateRow] = await q("select id, company_id, company_role, wholesale_discount_pct from users where email=$1", [mateEmail]);
check(
  "they inherit the company's trade terms",
  mateRow.company_id === companyId && mateRow.company_role === "buyer" && mateRow.wholesale_discount_pct === 10,
  JSON.stringify(mateRow),
);
r = await mate.post("/api/company", { action: "accept", token });
check("an invitation cannot be used twice", r.status === 410, r.text.slice(0, 140));

// --- shared agreed prices ------------------------------------------------------------------------------
const [product] = await q("select id, case_price, min_cases from products where active and tax_class='general' order by case_price desc limit 1");
await setStock(product.id, 500);
const agreed = Math.round(product.case_price * 0.6);
await q("delete from account_prices");
await q(
  "insert into account_prices (user_id, company_id, product_id, case_price) values ($1, $2, $3, $4)",
  [ownerRow.id, companyId, product.id, agreed],
);
const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const cases = Math.max(product.min_cases, Math.ceil(200_000 / product.case_price));
const quoteFor = (client) => client.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });

r = await quoteFor(mate);
check("a colleague gets the company's agreed price", r.json?.quote?.lines?.[0]?.casePrice === agreed, JSON.stringify(r.json?.quote?.lines?.[0]?.casePrice));
r = await quoteFor(stranger);
check("someone outside the company does not", r.status === 403 || r.json?.quote?.lines?.[0]?.casePrice !== agreed, String(r.status));

// --- shared order history ---------------------------------------------------------------------------------
const priced = await quoteFor(mate);
r = await mate.post("/api/orders", {
  items: [{ productId: product.id, cases }],
  address: NJ,
  shippingOptionId: priced.json.quote.shippingOptionId,
  checkoutId: randomUUID(),
  email: mateEmail,
  name: "Sam Mate",
  company: "Harbor House Provisions",
  phone: "2075550184",
  paymentMethod: "ach",
});
check("the colleague places an order", r.status === 200 && r.json.orderNumber, r.text.slice(0, 160));
const orderNumber = r.json.orderNumber;
const [orderRow] = await q("select company_id from orders where order_number=$1", [orderNumber]);
check("the order is stamped with the company", orderRow.company_id === companyId, JSON.stringify(orderRow));

r = await owner.get(`/order/${orderNumber}`);
check("the owner can open a colleague's order", r.status === 200, String(r.status));
r = await stranger.get(`/order/${orderNumber}`);
check("an outsider cannot", r.status === 404, String(r.status));

// --- roles -------------------------------------------------------------------------------------------------
r = await mate.post("/api/company", { action: "invite", email: "someone@else.com", role: "buyer" });
check("a buyer cannot invite", r.status === 403, r.text.slice(0, 140));
r = await owner.post("/api/company", { action: "set-role", memberId: mateRow.id, role: "viewer" });
check("the owner can change a role", r.status === 200, r.text.slice(0, 140));
r = await owner.post("/api/company", { action: "remove", memberId: ownerRow.id });
check("the last owner cannot be removed", r.status === 409, r.text.slice(0, 140));
r = await owner.post("/api/company", { action: "remove", memberId: mateRow.id });
check("the owner can remove a colleague", r.status === 200, r.text.slice(0, 140));
const [afterRemoval] = await q("select company_id from users where id=$1", [mateRow.id]);
check("the removed colleague is off the account", afterRemoval.company_id === null, JSON.stringify(afterRemoval));
r = await mate.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });
check("and no longer gets the company's price", r.json?.quote?.lines?.[0]?.casePrice !== agreed, JSON.stringify(r.json?.quote?.lines?.[0]?.casePrice));

await q("update users set company_id = null, company_role = null");
await q("delete from companies");
await q("delete from account_prices");
await q("update users set wholesale_discount_pct = 0 where id=$1", [ownerRow.id]);
await done();
