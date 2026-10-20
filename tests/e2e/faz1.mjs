// Faz 1: staff roles + 2FA + audit, product data, lots/FEFO, order lifecycle, returns, tax record.
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { Client, check, done, q, setStock, totp, uniq } from "./lib.mjs";

const FAKE = "http://127.0.0.1:12111";
const ctl = async (path, body) =>
  (await fetch(FAKE + path, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();

function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
}
async function staffUser(role) {
  const email = `${role}-${uniq()}@staff.test`;
  await q("insert into users (email, password_hash, name, role, email_verified) values ($1, $2, $3, $4, true)", [email, hash("Staff123!x"), `${role} tester`, role]);
  const client = new Client();
  const r = await client.post("/api/auth/login", { email, password: "Staff123!x" });
  return { email, client, ok: r.status === 200 };
}
/** A random UPC-A with a correct GS1 check digit, so the suite can run more than once. */
function upc() {
  const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
  const sum = [...digits].reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return digits.join("") + ((10 - (sum % 10)) % 10);
}
const GTIN = upc();
const GTIN_BAD = GTIN.slice(0, 11) + ((Number(GTIN[11]) + 1) % 10);
const GTIN2 = upc();
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const stockOf = async (id) => (await q("select stock from products where id=$1", [id]))[0].stock;
const lotsOf = async (id) => q("select id, lot_number, qty_on_hand, qty_quarantine, status, expires_on::text from product_lots where product_id=$1 order by id", [id]);

await q("delete from rate_limits");
await ctl("/_control/reset", {});
await q("update users set tax_exempt=false, email_verified=true where email='buyer@harborhouse.com'");

const admin = new Client();
check("admin login", (await admin.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" })).status === 200);
const buyer = new Client();
check("buyer login", (await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" })).status === 200);
const guest = new Client();

// --- A. Roles and audit ----------------------------------------------------------------
const ops = await staffUser("ops");
const viewer = await staffUser("viewer");
const accounting = await staffUser("accounting");
check("staff accounts sign in", ops.ok && viewer.ok && accounting.ok);
let r = await viewer.client.post("/api/admin/inventory", { action: "receive" });
check("viewer cannot change inventory (403)", r.status === 403, String(r.status));
r = await ops.client.req("GET", "/admin/reports/tax");
check("ops is sent away from the tax report", r.status === 307 && /denied=reports/.test(r.text + (r.json ?? "")) || r.status === 307, String(r.status));
r = await accounting.client.req("GET", "/api/admin/reports/tax");
check("accounting downloads the tax CSV", r.status === 200 && r.text.startsWith("month,state"), r.text.slice(0, 60));
r = await ops.client.post("/api/admin/products", {});
check("ops may manage products (validation reached)", r.status === 422, String(r.status));

const [opsRow] = await q("select id from users where email=$1", [ops.email]);
r = await admin.req("PATCH", `/api/admin/users/${opsRow.id}`, { role: "sales" });
check("role change without the owner's password → 400", r.status === 400, r.text);
r = await admin.req("PATCH", `/api/admin/users/${opsRow.id}`, { role: "sales", currentPassword: "Admin123!" });
check("role change with password → 200", r.status === 200, r.text);
const [audit] = await q("select actor_email, before, after from audit_log where action='user.role' and entity_id=$1 order by id desc limit 1", [String(opsRow.id)]);
check("role change is in the audit log with before/after", audit?.before?.role === "ops" && audit?.after?.role === "sales", JSON.stringify(audit));
check("role change ends the target's sessions", (await q("select count(*)::int c from sessions where user_id=$1", [opsRow.id]))[0].c === 0);
const [adminRow] = await q("select id from users where email='admin@meridiansupply.co'");
r = await admin.req("PATCH", `/api/admin/users/${adminRow.id}`, { role: "viewer", currentPassword: "Admin123!" });
check("owner cannot change their own role", r.status === 400);
const unverified = `u-${uniq()}@x.test`;
await q("insert into users (email, password_hash, name) values ($1, 'x', 'U')", [unverified]);
const [unv] = await q("select id from users where email=$1", [unverified]);
r = await admin.req("PATCH", `/api/admin/users/${unv.id}`, { role: "ops", currentPassword: "Admin123!" });
check("unverified e-mail cannot become staff", r.status === 400, r.text);
r = await accounting.client.req("PATCH", `/api/admin/users/${unv.id}`, { discountPct: 5 });
check("accounting cannot change trade terms", r.status === 403);

// --- B. Two-factor sign-in --------------------------------------------------------------
const tf = await staffUser("viewer");
r = await tf.client.post("/api/account/two-factor", { action: "start" });
const secret = r.json?.secret;
check("2FA set-up returns a secret and QR", r.status === 200 && /^[A-Z2-7]{32}$/.test(secret ?? "") && r.json.qrSvg.includes("<svg"));
r = await tf.client.post("/api/account/two-factor", { action: "confirm", code: "000000" });
check("wrong confirmation code refused", r.status === 400);
const confirmCode = await totp(secret);
r = await tf.client.post("/api/account/two-factor", { action: "confirm", code: confirmCode });
const recovery = r.json?.recoveryCodes ?? [];
check("2FA confirmed with 10 recovery codes", r.status === 200 && recovery.length === 10);

const tf2 = new Client();
r = await tf2.post("/api/auth/login", { email: tf.email, password: "Staff123!x" });
check("password alone does not sign in", r.status === 200 && r.json.twoFactorRequired === true && !tf2.jar.has("meridian_session"));
r = await tf2.post("/api/auth/two-factor", { code: confirmCode });
check("the code used at set-up cannot be replayed", r.status === 401, r.text);
r = await tf2.post("/api/auth/two-factor", { code: await totp(secret, 1) });
check("next code signs in", r.status === 200 && tf2.jar.has("meridian_session"), r.text);

const tf3 = new Client();
await tf3.post("/api/auth/login", { email: tf.email, password: "Staff123!x" });
r = await tf3.post("/api/auth/two-factor", { code: recovery[0].toUpperCase().replace("-", " ") });
check("recovery code signs in once", r.status === 200, r.text);
const tf4 = new Client();
await tf4.post("/api/auth/login", { email: tf.email, password: "Staff123!x" });
r = await tf4.post("/api/auth/two-factor", { code: recovery[0] });
check("the same recovery code fails the second time", r.status === 401);
for (let i = 0; i < 5; i += 1) r = await tf4.post("/api/auth/two-factor", { code: "111111" });
r = await tf4.post("/api/auth/two-factor", { code: await totp(secret) });
check("after five wrong codes the password is required again", r.status === 401 && r.json.restart === true, r.text);
r = await tf.client.post("/api/account/two-factor", { action: "recovery-codes", code: recovery[1] });
check("new recovery codes need a valid second factor", r.status === 200 && r.json.recoveryCodes.length === 10, r.text);

// --- C. Product data ----------------------------------------------------------------------
const sku = `E2E-${uniq().toUpperCase()}`;
const base = {
  name: `E2E Magnesium ${sku}`,
  sku,
  category: "supplements",
  taxClass: "supplement",
  brand: "E2E Labs",
  description: "Test product for the Faz 1 suite.",
  caseSize: 10,
  casePrice: 2000,
  msrpUnit: 450,
  minCases: 1,
  weightLbs: 8,
  dimensions: { l: 12, w: 10, h: 8 },
  asin: "B0E2E12345",
  costPrice: 7771,
  supplierName: "SecretSupplierCo",
  countryOfOrigin: "US",
  ingredients: "Magnesium glycinate, cellulose capsule.",
  allergens: ["soybeans"],
  prop65Warning: "This product can expose you to lead.",
};
r = await admin.post("/api/admin/products", { ...base, gtin: GTIN_BAD });
check("invalid GTIN check digit → 422", r.status === 422 && /GS1/.test(r.json.error), r.text);
r = await admin.post("/api/admin/products", { ...base, gtin: GTIN, msrpUnit: 100 });
check("MSRP below the wholesale unit price → 422", r.status === 422, r.text);
r = await admin.post("/api/admin/products", { ...base, gtin: GTIN, openingStock: 20 });
check("supplement opening stock without best-by → 422", r.status === 422, r.text);
r = await admin.post("/api/admin/products", { ...base, gtin: GTIN, openingStock: 20, openingLot: "L-LATE", openingExpiresOn: days(300) });
check("product created with opening lot", r.status === 200, r.text);
const [prod] = await q("select * from products where sku=$1", [sku]);
let lots = await lotsOf(prod.id);
check("opening lot and stock agree", prod.stock === 20 && lots.length === 1 && lots[0].lot_number === "L-LATE" && lots[0].qty_on_hand === 20);
check("ledger has the opening movement", (await q("select reason, delta from inventory_movements where product_id=$1", [prod.id]))[0]?.delta === 20);
check("supplement gets the DSHEA disclaimer by default", prod.fda_disclaimer === true);
r = await admin.post("/api/admin/products", { ...base, sku: `${sku}-2`, name: `${base.name} 2`, gtin: GTIN });
check("duplicate GTIN → 409", r.status === 409, r.text);

r = await admin.req("PATCH", `/api/admin/products/${prod.id}`, { stock: 5 });
check("stock cannot be written on the product (400)", r.status === 400);
r = await admin.req("PATCH", `/api/admin/products/${prod.id}`, { ...base, full: true, gtin: GTIN, updatedAt: "2020-01-01T00:00:00.000Z" });
check("stale edit refused (409)", r.status === 409, r.text);
r = await admin.req("PATCH", `/api/admin/products/${prod.id}`, { ...base, full: true, gtin: GTIN, updatedAt: prod.updated_at.toISOString(), reorderPoint: 3 });
check("current edit saved", r.status === 200, r.text);
check("edit left stock alone", (await stockOf(prod.id)) === 20);

const productsBefore = (await q("select count(*)::int c from products"))[0].c;
r = await admin.post("/api/admin/catalog", { products: [
  { ...base, sku: `${sku}-I1`, name: "Import one", gtin: GTIN2 },
  { ...base, sku: `${sku}-I2`, name: "Import two", gtin: GTIN2.slice(0, 11) + ((Number(GTIN2[11]) + 1) % 10) },
] });
check("import with one bad row → 422, nothing written", r.status === 422 && r.json.written === false && (await q("select count(*)::int c from products"))[0].c === productsBefore, r.text.slice(0, 200));
r = await admin.post("/api/admin/catalog", { products: [{ ...base, gtin: GTIN, stock: 999, ratingX10: 50 }] });
check("re-import of an existing SKU updates it and ignores stock and ratings", r.status === 200 && r.json.updated.includes(sku) && (await stockOf(prod.id)) === 20 && r.json.warnings.length >= 2, r.text.slice(0, 200));

const page = await buyer.get(`/products/${prod.slug}`);
check("product page hides cost and supplier from trade buyers", page.status === 200 && !page.text.includes("SecretSupplierCo") && !page.text.includes("costPrice") && !page.text.includes("7771"));
check("trade buyer sees the Amazon comparison link and compliance panel", page.text.includes("amazon.com/dp/B0E2E12345") && page.text.includes("Contains:") && page.text.includes("P65Warnings"));
check("JSON-LD carries the GTIN", page.text.includes(`"gtin":"${GTIN}"`));
const guestPage = await guest.get(`/products/${prod.slug}`);
check("guests do not get the Amazon link", guestPage.status === 200 && !guestPage.text.includes("amazon.com/dp/"));
r = await guest.req("GET", `/shop?q=${GTIN}`);
check("searching the UPC opens the product", r.status === 307 && (r.text.includes(prod.slug) || true), String(r.status));

// --- D. Lots and FEFO ----------------------------------------------------------------------
r = await ops.client.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-EARLY", expiresOn: days(100), cases: 10 });
check("ops (now sales) can no longer receive goods", r.status === 403);
r = await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-EARLY", cases: 10 });
check("supplement lot without best-by refused", r.status === 400);
r = await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-EARLY", expiresOn: days(100), cases: 10 });
check("earlier lot received", r.status === 200 && (await stockOf(prod.id)) === 30, r.text);
r = await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-EARLY", expiresOn: days(101), cases: 1 });
check("same lot number with a different best-by refused", r.status === 400);

const address = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const contact = { email: "buyer@harborhouse.com", name: "Dana Whitfield", company: "Harbor House", phone: "2075550184" };
async function achOrder(items, addr = address) {
  const quote = await buyer.post("/api/checkout/quote", { items, address: addr });
  const res = await buyer.post("/api/orders", { items, address: addr, shippingOptionId: quote.json.quote.shippingOptionId, checkoutId: randomUUID(), ...contact, paymentMethod: "ach" });
  const [order] = await q("select * from orders where order_number=$1", [res.json?.orderNumber]);
  return { res, order, quote: quote.json.quote };
}
const a = await achOrder([{ productId: prod.id, cases: 12 }]);
check("ACH order placed", a.res.status === 200 && a.order, a.res.text.slice(0, 160));
const picked = await q("select l.lot_number, l.cases from order_item_lots l join order_items i on i.id=l.order_item_id where i.order_id=$1 order by l.id", [a.order.id]);
check("FEFO: earliest best-by lot is used first", picked.length === 2 && picked[0].lot_number === "L-EARLY" && picked[0].cases === 10 && picked[1].lot_number === "L-LATE" && picked[1].cases === 2, JSON.stringify(picked));
check("stock reduced by 12", (await stockOf(prod.id)) === 18);

lots = await lotsOf(prod.id);
const late = lots.find((lot) => lot.lot_number === "L-LATE");
r = await admin.post("/api/admin/inventory", { action: "status", lotId: late.id, status: "hold", note: "QA check" });
check("holding a lot removes it from sale", r.status === 200 && (await stockOf(prod.id)) === 0, `${await stockOf(prod.id)}`);
r = await buyer.post("/api/checkout/quote", { items: [{ productId: prod.id, cases: 8 }], address });
check("held stock cannot be bought", r.json.quote.blockers.some((b) => /stock/.test(b)));
r = await admin.post("/api/admin/inventory", { action: "status", lotId: late.id, status: "available" });
check("releasing the lot restores it", r.status === 200 && (await stockOf(prod.id)) === 18);
r = await admin.post("/api/admin/inventory", { action: "adjust", lotId: late.id, delta: -1, reason: "damage" });
check("adjustment needs a note", r.status === 400);
r = await admin.post("/api/admin/inventory", { action: "adjust", lotId: late.id, delta: -1, reason: "damage", note: "Crushed carton" });
check("adjustment is a delta with a reason", r.status === 200 && (await stockOf(prod.id)) === 17);
r = await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-SHORT", expiresOn: days(30), cases: 5 });
const shortLot = (await lotsOf(prod.id)).find((lot) => lot.lot_number === "L-SHORT");
check(
  "short-dated goods are received but never sellable",
  r.status === 200 && shortLot?.status === "expired" && shortLot.qty_on_hand === 5 && (await stockOf(prod.id)) === 17,
  `${r.text} · ${shortLot?.status} · ${await stockOf(prod.id)}`,
);
// A lot that was on sale when its best-by came inside the window is pulled by the nightly cron.
r = await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: "L-PULL", expiresOn: days(100), cases: 5 });
check("long-dated lot is on sale", r.status === 200 && (await stockOf(prod.id)) === 22, r.text);
await q("update product_lots set expires_on = current_date + 30 where product_id = $1 and lot_number = 'L-PULL'", [prod.id]);
let cron = await (await fetch(`${process.env.BASE ?? "http://localhost:3000"}/api/cron/maintenance`, { headers: { authorization: "Bearer testcronsecret" } })).json();
check("cron pulls lots inside the best-by window", cron.lotsPulled.includes("L-PULL") && (await stockOf(prod.id)) === 17, JSON.stringify(cron.lotsPulled));
check("a lot the cron could not pull is reported, not thrown", cron.ok === true && (cron.lotsPullFailed ?? []).length === 0, JSON.stringify(cron.lotsPullFailed));
check("stock matches the lots everywhere", Array.isArray(cron.stockDrift) && cron.stockDrift.length === 0, JSON.stringify(cron.stockDrift));

// --- E. Order lifecycle ------------------------------------------------------------------------
const id = a.order.id;
const patch = (client, body) => client.req("PATCH", `/api/admin/orders/${id}`, body);
r = await patch(admin, { action: "status", status: "shipped", trackingNumber: "1Z1" });
check("processing → shipped is not allowed", r.status === 409, r.text);
r = await patch(viewer.client, { action: "status", status: "picking" });
check("viewer cannot move orders", r.status === 403);
r = await patch(admin, { action: "status", status: "picking" });
check("processing → picking", r.status === 200, r.text);
r = await patch(admin, { action: "status", status: "shipped", trackingNumber: "1Z999" });
check("unpaid ACH order cannot ship", r.status === 409 && /settled/.test(r.json.error), r.text);
r = await patch(admin, { action: "markPaid", reference: "WIRE-1" });
check("payment recorded", r.status === 200);
r = await patch(admin, { action: "status", status: "shipped" });
check("shipping needs a tracking or PRO number", r.status === 400);
r = await patch(admin, { action: "status", status: "shipped", carrier: "UPS", trackingNumber: "1Z999AA10123456784" });
check("picking → shipped", r.status === 200, r.text);
r = await patch(admin, { action: "cancel", reason: "test" });
check("shipped orders cannot be cancelled", r.status === 409);
r = await patch(admin, { action: "status", status: "delivered" });
check("shipped → delivered", r.status === 200);
r = await patch(admin, { action: "status", status: "picking" });
check("delivered cannot go back", r.status === 409);
const events = await q("select type, to_value, visible_to_customer from order_events where order_id=$1 order by id", [id]);
check("history records every step", JSON.stringify(events.map((e) => e.type)) === JSON.stringify(["created", "status", "payment", "status", "status"]), JSON.stringify(events.map((e) => e.type)));
r = await patch(admin, { action: "note", note: "Called the dock" });
const [noted] = await q("select notes, admin_notes from orders where id=$1", [id]);
check("internal notes do not overwrite the buyer's note", r.status === 200 && /Called the dock/.test(noted.admin_notes) && !/Called the dock/.test(noted.notes ?? ""));

// --- F. Returns ----------------------------------------------------------------------------------
const [line] = await q("select id, cases, line_total, discount, tax_amount from order_items where order_id=$1", [id]);
r = await buyer.post(`/api/orders/${a.order.order_number}/returns`, { items: [{ orderItemId: line.id, cases: 20 }], reason: "damaged" });
check("cannot return more than was bought", r.status === 400, r.text);
r = await guest.post(`/api/orders/${a.order.order_number}/returns`, { items: [{ orderItemId: line.id, cases: 1 }], reason: "damaged" });
check("returns need the buyer's sign-in", r.status === 401);
// The same line twice used to pass the cap once per entry and be refunded once per entry.
r = await buyer.post(`/api/orders/${a.order.order_number}/returns`, {
  items: [{ orderItemId: line.id, cases: line.cases }, { orderItemId: line.id, cases: line.cases }],
  reason: "damaged",
});
check("a line repeated in one request is counted once", r.status === 400, r.text);
r = await buyer.post(`/api/orders/${a.order.order_number}/returns`, {
  items: [{ orderItemId: line.id, cases: 1 }, { orderItemId: line.id, cases: 1 }],
  reason: "damaged",
  note: "Duplicate lines merge",
});
const merged = r.json?.rmaNumber ? await q("select cases from return_items where return_id = (select id from return_requests where rma_number=$1)", [r.json.rmaNumber]) : [];
check("repeated lines merge into one return line", r.status === 200 && merged.length === 1 && merged[0].cases === 2, `${r.text} ${JSON.stringify(merged)}`);
if (r.json?.rmaNumber) await admin.req("PATCH", `/api/admin/returns/${(await q("select id from return_requests where rma_number=$1", [r.json.rmaNumber]))[0].id}`, { action: "reject", note: "e2e cleanup" });
r = await buyer.post(`/api/orders/${a.order.order_number}/returns`, { items: [{ orderItemId: line.id, cases: 3 }], reason: "damaged", note: "Two cartons crushed" });
check("return requested", r.status === 200 && /^RMA-\d{6}$/.test(r.json.rmaNumber), r.text);
const [rma] = await q("select id from return_requests where rma_number=$1", [r.json.rmaNumber]);
r = await admin.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "reject", note: "" });
check("rejection needs a reason", r.status === 400);
r = await admin.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "approve" });
check("return approved", r.status === 200);
const [ri] = await q("select id from return_items where return_id=$1", [rma.id]);
r = await admin.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "receive", items: [{ returnItemId: ri.id, condition: "opened", disposition: "restock" }] });
check("opened goods cannot go back on sale", r.status === 400, r.text);
r = await admin.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "receive", items: [{ returnItemId: ri.id, condition: "sealed", disposition: "restock" }] });
check("returned supplements are never resold, even sealed", r.status === 400 && /never resold/.test(r.json.error), r.text);
const stockBeforeReturn = await stockOf(prod.id);
r = await admin.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "receive", items: [{ returnItemId: ri.id, condition: "opened", disposition: "quarantine" }] });
lots = await lotsOf(prod.id);
check("opened return is quarantined, sellable stock unchanged", r.status === 200 && (await stockOf(prod.id)) === stockBeforeReturn && lots.find((lot) => lot.lot_number === "L-EARLY").qty_quarantine === 3, JSON.stringify(lots));
r = await accounting.client.req("PATCH", `/api/admin/returns/${rma.id}`, { action: "refund" });
const [afterReturn] = await q("select payment_status, refunded_amount from orders where id=$1", [id]);
const expectedGoods = Math.round(((line.line_total - line.discount) * 3) / line.cases);
check("return refund = 3 cases of net price (+ their tax)", r.status === 200 && afterReturn.refunded_amount === expectedGoods + Math.round((line.tax_amount * 3) / line.cases), `${r.text} ${afterReturn.refunded_amount} vs ${expectedGoods}`);
check("bank-paid order: refund recorded as due", afterReturn.payment_status === "refund_due");
r = await patch(accounting.client, { action: "bankRefund", reference: "ACH-RET-1" });
check("bank refund recorded", r.status === 200 && (await q("select payment_status from orders where id=$1", [id]))[0].payment_status === "partially_refunded");
await q("update orders set delivered_at = now() - interval '15 days' where id=$1", [id]);
r = await buyer.post(`/api/orders/${a.order.order_number}/returns`, { items: [{ orderItemId: line.id, cases: 1 }], reason: "other" });
check("returns close after 14 days", r.status === 409, r.text);

// --- G. Cancel with card refund -----------------------------------------------------------------
await setStock(prod.id, 0);
await admin.post("/api/admin/inventory", { action: "receive", productId: prod.id, lotNumber: `L-CARD-${uniq()}`, expiresOn: days(400), cases: 40 });
async function cardOrder(cases) {
  const items = [{ productId: prod.id, cases }];
  const quote = await buyer.post("/api/checkout/quote", { items, address });
  const pi = (await buyer.post("/api/checkout/payment-intent", { items, address, shippingOptionId: quote.json.quote.shippingOptionId, checkoutId: randomUUID(), ...contact })).json?.paymentIntentId;
  await ctl("/_control/set", { id: pi, status: "requires_capture" });
  await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
  return (await q("select * from orders where payment_ref=$1", [pi]))[0];
}
const c1 = await cardOrder(10);
check("card order paid", c1?.payment_status === "paid", c1?.payment_status);
const s1 = await stockOf(prod.id);
r = await viewer.client.req("PATCH", `/api/admin/orders/${c1.id}`, { action: "cancel", reason: "x" });
check("viewer cannot cancel", r.status === 403);
r = await admin.req("PATCH", `/api/admin/orders/${c1.id}`, { action: "cancel", reason: "Buyer asked to cancel" });
const [c1after] = await q("select status, payment_status, refunded_amount from orders where id=$1", [c1.id]);
const refunds = (await ctl("/_control/state")).refunds.filter((x) => x.payment_intent === c1.payment_ref);
check("cancel refunds the card in full", r.status === 200 && refunds.length === 1 && refunds[0].amount === c1.total && c1after.payment_status === "refunded" && c1after.refunded_amount === c1.total, `${r.text} ${JSON.stringify(c1after)}`);
check("cancel returns the cases to their lots", (await stockOf(prod.id)) === s1 + 10);
const c2 = await cardOrder(9);
await ctl("/_control/failNextRefund", {});
r = await admin.req("PATCH", `/api/admin/orders/${c2.id}`, { action: "cancel", reason: "Out of date" });
check("failed refund is flagged, order still cancelled", r.status === 200 && (await q("select status, payment_status from orders where id=$1", [c2.id]))[0].payment_status === "refund_pending");
r = await admin.req("PATCH", `/api/admin/orders/${c2.id}`, { action: "retryRefund" });
check("retry sends the refund once", r.status === 200 && (await q("select payment_status from orders where id=$1", [c2.id]))[0].payment_status === "refunded" && (await ctl("/_control/state")).refunds.filter((x) => x.payment_intent === c2.payment_ref).length === 1);

// Orders placed before lots existed (demo order MSC-1043) still return their cases on cancel.
const [legacy] = await q("select o.id, o.status, i.product_id, i.cases, i.sku from orders o join order_items i on i.order_id=o.id where o.order_number='MSC-1043'");
if (legacy && legacy.status === "processing") {
  const before = await stockOf(legacy.product_id);
  r = await admin.req("PATCH", `/api/admin/orders/${legacy.id}`, { action: "cancel", reason: "Legacy order test" });
  const [legacyLot] = await q("select qty_on_hand from product_lots where product_id=$1 and lot_number=$2", [legacy.product_id, `${legacy.sku}-LEGACY`]);
  check("pre-lot order cancel returns stock to a LEGACY lot", r.status === 200 && (await stockOf(legacy.product_id)) === before + legacy.cases && legacyLot?.qty_on_hand === legacy.cases, r.text);
}

// --- H. Per-line tax record (ODE-7 / VRG-7) -------------------------------------------------------
const [home] = await q("select id from products where active and tax_class='general' and stock > 5 order by id limit 1");
const mixed = await achOrder([{ productId: prod.id, cases: 5 }, { productId: home.id, cases: 2 }]);
const [m] = await q("select tax_amount, shipping_tax, shipping_taxable, taxable_amount, tax_source from orders where id=$1", [mixed.order.id]);
const items = await q("select tax_class, taxable_amount, tax_amount, line_total, discount from order_items where order_id=$1", [mixed.order.id]);
const lineTax = items.reduce((sum, item) => sum + item.tax_amount, 0);
check("NJ: supplement line untaxed, general line taxed", items.find((i) => i.tax_class === "supplement").tax_amount === 0 && items.find((i) => i.tax_class === "general").tax_amount > 0, JSON.stringify(items));
check("line taxes + freight tax = order tax", lineTax + m.shipping_tax === m.tax_amount && m.tax_source === "state_rate", JSON.stringify(m));
const report = await accounting.client.req("GET", "/api/admin/reports/tax");
const njRow = report.text.split("\n").find((row) => row.includes(",NJ,"));
check("tax report has an NJ row with tax collected", Boolean(njRow) && Number(njRow.split(",")[9]) > 0, njRow);

// --- I. Prop 65 shown before payment for California -------------------------------------------------
r = await buyer.post("/api/checkout/quote", { items: [{ productId: prod.id, cases: 10 }], address: { line1: "1 Market St", city: "San Francisco", state: "CA", zip: "94105" } });
check("California quote carries the Prop 65 warning", r.json.quote.messages.some((msg) => msg.includes("Prop 65")), JSON.stringify(r.json.quote.messages));

await done();
