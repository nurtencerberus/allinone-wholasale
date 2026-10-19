import { Client, check, done, q } from "./lib.mjs";

await q("delete from rate_limits");
const buyer = new Client();
let r = await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
check("wholesale buyer login", r.status === 200);
await q("update users set tax_exempt=false where email='buyer@harborhouse.com'");

const prods = await q("select id, name, category, tax_class, case_price, min_cases, stock from products where active order by id");
const home = prods.find((p) => p.category === "home");
const pantry = prods.find((p) => p.category === "pantry");
const supp = prods.find((p) => p.category === "supplements");
const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const PA = { line1: "1 Market St", city: "Philadelphia", state: "PA", zip: "19106" };
const quote = (items, address, extra = {}) => buyer.post("/api/checkout/quote", { items, address, ...extra });
const casesFor = (p, cents) => Math.max(p.min_cases, Math.ceil(cents / p.case_price));

// --- minimums ------------------------------------------------------------
await q("update products set min_cases=3 where id=$1", [home.id]);
r = await quote([{ productId: home.id, cases: 1 }, { productId: supp.id, cases: casesFor(supp, 30000) }], NJ);
check("MOQ below minCases is a blocker", r.json?.quote?.blockers?.some((b) => b.includes("minimum order is 3")), JSON.stringify(r.json?.quote?.blockers));
await q("update products set min_cases=1 where id=$1", [home.id]);

const cheapest = [...prods].sort((a, b) => a.case_price - b.case_price)[0];
r = await quote([{ productId: cheapest.id, cases: 1 }], NJ);
const small = cheapest.case_price < 15000;
check("$150 minimum is a blocker", !small || r.json.quote.blockers.some((b) => b.includes("minimum order is $150")), JSON.stringify(r.json?.quote?.blockers));

r = await quote([{ productId: supp.id, cases: 1000 }], NJ);
check(">999 cases is a blocker, not truncated", r.json.quote.blockers.some((b) => b.includes("999")) && r.json.quote.lines[0].cases === 1000);

r = await quote([{ productId: supp.id, cases: 2 }, { productId: supp.id, cases: 3 }], NJ);
check("duplicate lines merged", r.json.quote.lines.length === 1 && r.json.quote.lines[0].cases === 5);

r = await quote([{ productId: supp.id, cases: supp.stock + 1 }], NJ);
check("over-stock is a blocker", r.json.quote.blockers.some((b) => b.includes("in stock")));

// --- delivery area -------------------------------------------------------
const big = [{ productId: supp.id, cases: casesFor(supp, 30000) }];
for (const [name, address, needle] of [
  ["Alaska rejected", { line1: "1 Main", city: "Anchorage", state: "AK", zip: "99501" }, "contiguous 48"],
  ["Hawaii rejected", { line1: "1 Main", city: "Honolulu", state: "HI", zip: "96813" }, "contiguous 48"],
  ["state/ZIP mismatch rejected (DE + NJ ZIP)", { line1: "1 Main", city: "Paterson", state: "DE", zip: "07503" }, "is in NJ"],
  ["PO Box rejected", { line1: "PO Box 123", city: "Paterson", state: "NJ", zip: "07503" }, "PO Box"],
  ["APO state code rejected", { line1: "Unit 1", city: "APO", state: "AE", zip: "09001" }, "contiguous 48"],
]) {
  r = await quote(big, address);
  check(name, r.json?.quote?.blockers?.some((b) => b.includes(needle)), JSON.stringify(r.json?.quote?.blockers ?? r.json));
}
r = await quote(big, { line1: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", zip: "20500" });
check("DC accepted", r.json.quote.blockers.length === 0, JSON.stringify(r.json.quote.blockers));

// --- NJ tax --------------------------------------------------------------
r = await quote([{ productId: pantry.id, cases: casesFor(pantry, 30000) }, { productId: supp.id, cases: casesFor(supp, 30000) }], NJ);
let t = r.json.quote;
check("NJ: food + supplements → $0 tax", t.taxAmount === 0 && t.taxQuote.source === "state_rate", `${t.taxAmount} ${t.taxQuote.note}`);

r = await quote([{ productId: home.id, cases: casesFor(home, 30000) }], NJ);
t = r.json.quote;
const expectedAll = Math.round(((t.total - t.taxAmount) * 66.25) / 1000);
check("NJ: home goods taxed 6.625% on goods + freight", t.taxAmount === expectedAll && t.taxQuote.rateX1000 === 66.25, `${t.taxAmount} vs ${expectedAll}`);

r = await quote([{ productId: home.id, cases: casesFor(home, 20000) }, { productId: pantry.id, cases: casesFor(pantry, 20000) }], NJ);
t = r.json.quote;
const homeNet = t.lineNet[t.lines.findIndex((l) => l.taxClass === "general")];
const goods = t.lineNet.reduce((a, b) => a + b, 0);
const expectedMixed = Math.round(((homeNet + Math.round((t.shippingCost * homeNet) / goods)) * 66.25) / 1000);
check("NJ mixed: tax on taxable goods + their share of freight", t.taxAmount === expectedMixed, `${t.taxAmount} vs ${expectedMixed}`);

r = await quote([{ productId: home.id, cases: casesFor(home, 30000) }], PA);
check("PA (no nexus): no tax collected", r.json.quote.taxAmount === 0 && r.json.quote.taxQuote.source === "no_nexus");

// --- exemption -----------------------------------------------------------
await q("update users set tax_exempt=true, tax_exempt_state='NJ', tax_exempt_cert_number='ST3-TEST', tax_exempt_expires=null where email='buyer@harborhouse.com'");
r = await quote([{ productId: home.id, cases: casesFor(home, 30000) }], NJ);
check("exempt with NJ certificate → $0", r.json.quote.taxAmount === 0 && r.json.quote.taxQuote.source === "exempt");
await q("update users set tax_exempt_expires=now() - interval '1 day' where email='buyer@harborhouse.com'");
r = await quote([{ productId: home.id, cases: casesFor(home, 30000) }], NJ);
check("expired certificate → taxed", r.json.quote.taxAmount > 0);
await q("update users set tax_exempt_expires=null, tax_exempt_cert_number=null where email='buyer@harborhouse.com'");
r = await quote([{ productId: home.id, cases: casesFor(home, 30000) }], NJ);
check("exempt flag without certificate → taxed", r.json.quote.taxAmount > 0);
await q("update users set tax_exempt=false where email='buyer@harborhouse.com'");

// --- freight selection ----------------------------------------------------
r = await quote(big, NJ, { shippingOptionId: "does-not-exist" });
check("unknown freight option is a blocker, not swapped", r.json.quote.blockers.some((b) => b.includes("freight service")));

// --- inactive product -----------------------------------------------------
await q("update products set active=false where id=$1", [home.id]);
r = await quote([...big, { productId: home.id, cases: 2 }], NJ);
check("inactive product removed with notice", r.json.quote.removedProductIds.includes(home.id) && r.json.quote.messages.some((m) => m.includes("no longer available")));
await q("update products set active=true where id=$1", [home.id]);

// --- order endpoint refuses blockers ---------------------------------------
const opt = (await quote(big, NJ)).json.quote.shippingOptionId;
r = await buyer.post("/api/orders", { items: [{ productId: cheapest.id, cases: 1 }], address: NJ, shippingOptionId: opt, paymentMethod: "ach", name: "Dana", email: "buyer@harborhouse.com", checkoutId: crypto.randomUUID() });
check("order refused below minimum", !small || (r.status === 400 && r.json.error.includes("minimum")), r.text.slice(0, 120));
r = await buyer.post("/api/orders", { items: big, address: { ...NJ, state: "DE" }, shippingOptionId: opt, paymentMethod: "ach", name: "Dana", email: "buyer@harborhouse.com", checkoutId: crypto.randomUUID() });
check("order refused on state/ZIP mismatch", r.status === 400 && r.json.error.includes("is in NJ"), r.text.slice(0, 120));

// --- saved address validation ---------------------------------------------
r = await buyer.post("/api/account/addresses", { label: "x", name: "x", line1: "1 Main", city: "Juneau", state: "AK", zip: "99801" });
check("saved address outside service area rejected", r.status === 400);

await done();
