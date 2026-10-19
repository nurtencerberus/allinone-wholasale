import { createHmac, randomUUID } from "node:crypto";
import { BASE, Client, check, done, q } from "./lib.mjs";

const FAKE = "http://127.0.0.1:12111";
const ctl = async (path, body) =>
  (await fetch(FAKE + path, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
const setStatus = (id, status) => ctl("/_control/set", { id, status });
const callsFor = async (id) => (await ctl("/_control/state")).calls.filter((c) => c.path.includes(id));

function webhook(type, id, secret = "whsec_testsecret") {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type, data: { object: { id, object: "payment_intent" } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}`, "Content-Type": "application/json" }, body: payload });
}

await q("delete from rate_limits");
await ctl("/_control/reset", {});
await q("update users set tax_exempt=false, email_verified=true where email='buyer@harborhouse.com'");
const buyer = new Client();
check("buyer login", (await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" })).status === 200);

const [prod] = await q("select id, case_price, stock, min_cases from products where active and category='supplements' order by id limit 1");
await q("update products set stock=500 where id=$1", [prod.id]);
const cases = Math.max(prod.min_cases, Math.ceil(30000 / prod.case_price));
const address = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const contact = { email: "buyer@harborhouse.com", name: "Dana Whitfield", company: "Harbor House", phone: "2075550184" };
const stock = async () => (await q("select stock from products where id=$1", [prod.id]))[0].stock;

async function startPayment(extra = {}) {
  const quote = await buyer.post("/api/checkout/quote", { items: [{ productId: prod.id, cases }], address });
  const shippingOptionId = quote.json.quote.shippingOptionId;
  const checkoutId = randomUUID();
  const r = await buyer.post("/api/checkout/payment-intent", { items: [{ productId: prod.id, cases }], address, shippingOptionId, checkoutId, ...contact, ...extra });
  return { r, checkoutId, shippingOptionId, pi: r.json?.paymentIntentId };
}
const orderFor = async (pi) => (await q("select id, order_number, payment_status, status from orders where payment_ref=$1", [pi]))[0];

// 1. Happy path ----------------------------------------------------------
let s0 = await stock();
let { r, pi, checkoutId } = await startPayment();
check("payment-intent created in manual-capture mode", r.status === 200 && r.json.mode === "stripe" && pi?.startsWith("pi_test"), r.text.slice(0, 150));
const created = (await ctl("/_control/state")).intents.find((i) => i.id === pi);
check("intent uses capture_method=manual", created?.capture_method === "manual");
const [sess] = await q("select status, amount, payload->'contact'->>'name' as name from checkout_sessions where payment_intent_id=$1", [pi]);
check("checkout session saved server-side with contact", sess?.status === "open" && sess.name === "Dana Whitfield");
const again = await buyer.post("/api/checkout/payment-intent", { items: [{ productId: prod.id, cases }], address, shippingOptionId: r.json.quote.shippingOptionId, checkoutId, ...contact });
check("reloading payment step reuses the same intent (idempotent)", again.json?.paymentIntentId === pi, `${again.json?.paymentIntentId} vs ${pi}`);

r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
check("order refused before authorisation", r.status === 402, r.text);
await setStatus(pi, "requires_capture");
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
let o = await orderFor(pi);
check("authorised → order created", r.status === 200 && o, r.text.slice(0, 120));
check("captured after order", (await callsFor(pi)).some((c) => c.path.endsWith("/capture")) && o?.payment_status === "paid", o?.payment_status);
check("stock decremented once", (await stock()) === s0 - cases, `${s0} -> ${await stock()}`);
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
check("re-submit returns the same order, no second order", r.status === 200 && r.json.orderNumber === o.order_number && (await q("select count(*)::int c from orders where payment_ref=$1", [pi]))[0].c === 1);

// 2. Tab closed: webhook creates the order --------------------------------
s0 = await stock();
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
let w = await webhook("payment_intent.amount_capturable_updated", pi);
o = await orderFor(pi);
check("webhook alone creates and captures the order", w.status === 200 && o?.payment_status === "paid", `${w.status} ${o?.payment_status}`);
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
check("browser arriving later gets the webhook's order", r.status === 200 && r.json.orderNumber === o.order_number);
check("stock decremented once (webhook path)", (await stock()) === s0 - cases);

// 3. Browser and webhook at the same time ----------------------------------
s0 = await stock();
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
await Promise.all([
  buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi }),
  webhook("payment_intent.amount_capturable_updated", pi),
  webhook("payment_intent.amount_capturable_updated", pi),
]);
await new Promise((res) => setTimeout(res, 300));
const concurrent = (await q("select count(*)::int c from orders where payment_ref=$1", [pi]))[0].c;
check("concurrent browser + 2 webhooks → exactly one order", concurrent === 1, String(concurrent));
check("concurrent: stock decremented once", (await stock()) === s0 - cases, `${s0} -> ${await stock()}`);
check("concurrent: captured once", (await callsFor(pi)).filter((c) => c.path.endsWith("/capture")).length >= 1 && (await orderFor(pi))?.payment_status === "paid");

// 4. Price changed while paying → authorisation released, no order -------------
s0 = await stock();
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
const [orig] = await q("select case_price, price_tiers from products where id=$1", [prod.id]);
await q(`update products set case_price = case_price + 100,
  price_tiers = coalesce((select jsonb_agg(jsonb_set(t, '{casePrice}', to_jsonb((t->>'casePrice')::int + 100))) from jsonb_array_elements(price_tiers) t), '[]'::jsonb)
  where id=$1`, [prod.id]);
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
await q("update products set case_price=$2, price_tiers=$3 where id=$1", [prod.id, orig.case_price, JSON.stringify(orig.price_tiers)]);
check("price change → 409 and 'No charge was made'", r.status === 409 && /No charge was made/.test(r.json.error), r.text);
check("price change → intent cancelled, never captured", (await callsFor(pi)).some((c) => c.path.endsWith("/cancel")) && !(await callsFor(pi)).some((c) => c.path.endsWith("/capture")));
check("price change → no order, stock untouched", !(await orderFor(pi)) && (await stock()) === s0);

// 5. Sold out while paying ----------------------------------------------------
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
const keep = await stock();
await q("update products set stock=0 where id=$1", [prod.id]);
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
await q("update products set stock=$2 where id=$1", [prod.id, keep]);
check("sold out → 409, cancelled, no order", r.status === 409 && (await callsFor(pi)).some((c) => c.path.endsWith("/cancel")) && !(await orderFor(pi)), r.text.slice(0, 120));

// 6. Capture fails → order cancelled and restocked ------------------------------
s0 = await stock();
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
await ctl("/_control/failNextCapture", {});
r = await buyer.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
o = await orderFor(pi);
check("capture failure → 402 to buyer", r.status === 402, r.text);
check("capture failure → order cancelled, stock restored", o?.status === "cancelled" && (await stock()) === s0, `${o?.status} ${s0}->${await stock()}`);

// 7. Someone else's payment ---------------------------------------------------
const other = new Client();
await other.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" });
({ pi } = await startPayment());
await setStatus(pi, "requires_capture");
r = await other.post("/api/orders", { paymentMethod: "card", paymentIntentId: pi });
check("another account cannot finalise this payment", r.status === 404, String(r.status));

// 8. Webhook signature ----------------------------------------------------------
w = await webhook("payment_intent.amount_capturable_updated", pi, "whsec_wrong");
check("webhook with bad signature → 400", w.status === 400);

// 9. Cron sweeps the payment both browser and webhook missed --------------------------
await q("update checkout_sessions set updated_at = now() - interval '20 minutes' where payment_intent_id=$1", [pi]);
let c = await fetch(`${BASE}/api/cron/maintenance`);
check("cron without secret → 401", c.status === 401);
c = await fetch(`${BASE}/api/cron/maintenance`, { headers: { authorization: "Bearer testcronsecret" } });
const report = await c.json();
check("cron finalises stale authorised checkout", c.status === 200 && (await orderFor(pi))?.payment_status === "paid", JSON.stringify(report.cardCheckouts));

// 10. ACH idempotency + overdue cancellation -------------------------------------
s0 = await stock();
const quote = await buyer.post("/api/checkout/quote", { items: [{ productId: prod.id, cases }], address });
const achBody = { items: [{ productId: prod.id, cases }], address, shippingOptionId: quote.json.quote.shippingOptionId, checkoutId: randomUUID(), ...contact, paymentMethod: "ach" };
const [a1, a2] = await Promise.all([buyer.post("/api/orders", achBody), buyer.post("/api/orders", achBody)]);
check("double ACH submit → same order number", a1.status === 200 && a2.status === 200 && a1.json.orderNumber === a2.json.orderNumber, `${a1.status}/${a2.status} ${a1.json?.orderNumber} ${a2.json?.orderNumber} ${a2.text.slice(0, 80)}`);
check("double ACH submit → stock taken once", (await stock()) === s0 - cases, `${s0} -> ${await stock()}`);
await q("update orders set created_at = now() - interval '8 days' where order_number=$1", [a1.json.orderNumber]);
c = await fetch(`${BASE}/api/cron/maintenance`, { headers: { authorization: "Bearer testcronsecret" } });
const rep2 = await c.json();
const [achOrder] = await q("select status from orders where order_number=$1", [a1.json.orderNumber]);
check("unpaid ACH after 7 days → cancelled, stock returned", achOrder.status === "cancelled" && (await stock()) === s0 && rep2.unpaidAchCancelled.includes(a1.json.orderNumber), JSON.stringify(rep2));

await done();
