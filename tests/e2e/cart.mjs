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

// --- freight rules (KRG-4, KRG-7) -------------------------------------------------------------
// The allowance is for ground parcel, so the shipment must stay under the pallet thresholds:
// price and carton size are fixed here instead of relying on whatever the seed happens to hold.
const freightSku = [...prods].sort((a, b) => b.case_price - a.case_price)[0];
const [freightBefore] = await q("select weight_oz, dimensions from products where id=$1", [freightSku.id]);
await q(`update products set weight_oz = 48, dimensions = '{"l":8,"w":6,"h":4}'::jsonb where id=$1`, [freightSku.id]);
const freight = [{ productId: freightSku.id, cases: casesFor(freightSku, 150_000) }];
r = await quote(freight, NJ);
let shipOptions = r.json.quote.shippingOptions;
const groundOption = shipOptions.find((option) => option.ground);
check("a ground option is offered", Boolean(groundOption), JSON.stringify(shipOptions.map((o) => o.id)));
check("the freight allowance waives ground over the threshold", r.json.quote.shippingCost === 0 && /allowance/i.test(groundOption?.note ?? ""), JSON.stringify(r.json.quote.shippingOptions));
const airOption = shipOptions.find((option) => !option.ground && option.mode === "parcel");
if (airOption) {
  r = await quote(freight, NJ, { shippingOptionId: airOption.id });
  check("the allowance does not pay for an air upgrade", r.json.quote.shippingCost > 0, `${r.json.quote.shippingCost}`);
}
r = await quote([{ productId: freightSku.id, cases: freightSku.min_cases }], NJ);
check("a small order pays for ground", r.json.quote.shippingOptions.find((o) => o.ground)?.cost > 0, JSON.stringify(r.json.quote.shippingOptions.map((o) => [o.id, o.cost])));

await q("update products set hazmat = true where id=$1", [freightSku.id]);
r = await quote(freight, NJ);
check("hazardous goods are not offered an air service", r.json.quote.shippingOptions.every((option) => option.ground || option.mode === "ltl"), JSON.stringify(r.json.quote.shippingOptions.map((o) => o.id)));
await q("update products set hazmat = false where id=$1", [freightSku.id]);
await q("update products set weight_oz = $2, dimensions = $3 where id=$1", [freightSku.id, freightBefore.weight_oz, freightBefore.dimensions]);

// --- cart view (SEP-3): prices come from the server, never from local storage ----------------
const cartItems = [{ productId: supp.id, cases: 2 }, { productId: supp.id, cases: 1 }];
r = await buyer.post("/api/cart", { items: cartItems });
const buyerCart = r.json?.cart;
check(
  "cart view prices the cart for a trade account",
  r.status === 200 && buyerCart?.pricesVisible === true && buyerCart.lines.length === 1 && buyerCart.lines[0].cases === 3 && buyerCart.lines[0].casePrice > 0,
  r.text.slice(0, 160),
);
check(
  "cart subtotal equals the sum of its lines",
  buyerCart.subtotal === buyerCart.lines.reduce((sum, line) => sum + line.lineTotal, 0),
  `${buyerCart.subtotal}`,
);
const guestCart = new Client();
r = await guestCart.post("/api/cart", { items: cartItems });
check(
  "the same cart shows no price once signed out",
  r.status === 200 && r.json.cart.pricesVisible === false && r.json.cart.subtotal === null && r.json.cart.lines.every((line) => line.casePrice === null && line.lineTotal === null),
  r.text.slice(0, 160),
);
check("locked cart still shows what is in it", r.json.cart.lines.length === 1 && r.json.cart.lines[0].sku === (await q("select sku from products where id=$1", [supp.id]))[0].sku);
r = await buyer.post("/api/cart", { items: [{ productId: supp.id, cases: supp.stock + 1 }] });
check("cart view flags a line that cannot be ordered", r.json.cart.lines[0].problem?.includes("stock"), JSON.stringify(r.json.cart.lines[0]));
await q("update products set active=false where id=$1", [home.id]);
r = await buyer.post("/api/cart", { items: [{ productId: home.id, cases: 1 }, { productId: supp.id, cases: 2 }] });
check("cart view drops an inactive product", r.json.cart.removedProductIds.includes(home.id) && r.json.cart.lines.length === 1);
await q("update products set active=true where id=$1", [home.id]);

// --- stored cart (SEP-7) ----------------------------------------------------------------------
await q("delete from cart_items where cart_id in (select id from carts where user_id=(select id from users where email='buyer@harborhouse.com'))");
await q("delete from carts where user_id=(select id from users where email='buyer@harborhouse.com')");
r = await buyer.req("PUT", "/api/cart", { items: [{ productId: supp.id, cases: 3 }, { productId: home.id, cases: 1 }] });
check("a trade account's cart is stored", r.status === 200 && r.json.stored === true && r.json.items.length === 2, r.text.slice(0, 160));

const second = new Client();
await second.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
r = await second.req("GET", "/api/cart");
check("the cart is there on another device", r.status === 200 && r.json.items.length === 2, r.text.slice(0, 160));

// The second device carries one line of its own and a smaller quantity of a shared line.
r = await second.req("PATCH", "/api/cart", { items: [{ productId: supp.id, cases: 1 }, { productId: pantry.id, cases: 2 }] });
const mergedLines = Object.fromEntries((r.json.items ?? []).map((line) => [line.productId, line.cases]));
check(
  "sign-in merges the two carts, taking the larger quantity",
  r.status === 200 && Object.keys(mergedLines).length === 3 && mergedLines[supp.id] === 3 && mergedLines[pantry.id] === 2,
  JSON.stringify(r.json.items),
);

r = await guestCart.req("GET", "/api/cart");
check("a guest has no stored cart and no error", r.status === 200 && r.json.stored === false && r.json.items.length === 0, r.text.slice(0, 120));
r = await guestCart.req("PUT", "/api/cart", { items: [{ productId: supp.id, cases: 2 }] });
check("a guest cannot write a stored cart", r.status === 200 && r.json.stored === false && (await q("select count(*)::int as c from carts"))[0].c === 1, r.text.slice(0, 120));

r = await buyer.req("PUT", "/api/cart", { items: [] });
check("emptying the cart empties the stored copy", r.status === 200 && r.json.items.length === 0);

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
