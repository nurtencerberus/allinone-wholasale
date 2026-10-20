// SEP-6: coupon windows, usage limits, tier rules, stacking and what a freight code waives.
import { randomUUID } from "node:crypto";
import { Client, check, done, q, setStock } from "./lib.mjs";

await q("delete from rate_limits");
const buyer = new Client();
let r = await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
check("wholesale buyer login", r.status === 200, r.text.slice(0, 120));
const [account] = await q("select id, wholesale_discount_pct from users where email='buyer@harborhouse.com'");

const [product] = await q("select id, case_price, min_cases from products where active and tax_class='general' order by case_price desc limit 1");
await setStock(product.id, 500);
const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
// Comfortably over the $150 minimum and the $750 free-freight threshold.
const cases = Math.max(product.min_cases, Math.ceil(90_000 / product.case_price));
const items = [{ productId: product.id, cases }];
const quote = (couponCode, extra = {}) => buyer.post("/api/checkout/quote", { items, address: NJ, couponCode, ...extra });

const CODES = ["E2E-WINDOW", "E2E-LIMIT", "E2E-TIER", "E2E-SOLO", "E2E-FREIGHT", "E2E-ONCE"];
await q("delete from coupons where code = any($1)", [CODES]);
const makeCoupon = async (code, fields = {}) => {
  const row = {
    kind: "percent",
    value: 10,
    min_subtotal: 0,
    description: `${code} test`,
    active: true,
    starts_at: null,
    expires_at: null,
    max_redemptions: null,
    per_customer_limit: null,
    allowed_tiers: JSON.stringify([]),
    stackable: true,
    ...fields,
  };
  const [created] = await q(
    `insert into coupons (code, kind, value, min_subtotal, description, active, starts_at, expires_at,
       max_redemptions, per_customer_limit, allowed_tiers, stackable)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [code, row.kind, row.value, row.min_subtotal, row.description, row.active, row.starts_at, row.expires_at,
     row.max_redemptions, row.per_customer_limit, row.allowed_tiers, row.stackable],
  );
  return created.id;
};

// --- redemption window ----------------------------------------------------------------------
const windowId = await makeCoupon("E2E-WINDOW", { expires_at: new Date(Date.now() - 86_400_000) });
r = await quote("E2E-WINDOW");
check("an expired coupon is refused", r.status === 400 && /expired/i.test(r.json.error), r.text.slice(0, 140));
await q("update coupons set expires_at = null, starts_at = now() + interval '2 days' where id=$1", [windowId]);
r = await quote("E2E-WINDOW");
check("a coupon that has not started is refused", r.status === 400 && /not available yet/i.test(r.json.error), r.text.slice(0, 140));
await q("update coupons set starts_at = now() - interval '1 day', expires_at = now() + interval '1 day' where id=$1", [windowId]);
r = await quote("E2E-WINDOW");
check("a coupon inside its window applies", r.status === 200 && r.json.quote.couponDiscount > 0, r.text.slice(0, 140));

// --- usage limits ---------------------------------------------------------------------------
await makeCoupon("E2E-LIMIT", { max_redemptions: 2 });
await q("update coupons set redeemed_count = 2 where code='E2E-LIMIT'");
r = await quote("E2E-LIMIT");
check("a fully redeemed coupon is refused", r.status === 400 && /fully redeemed/i.test(r.json.error), r.text.slice(0, 140));
await q("update coupons set redeemed_count = 1 where code='E2E-LIMIT'");
r = await quote("E2E-LIMIT");
check("a coupon with redemptions left applies", r.status === 200 && r.json.quote.couponDiscount > 0);

// --- who may use it -------------------------------------------------------------------------
await makeCoupon("E2E-TIER", { allowed_tiers: JSON.stringify(["retail"]) });
r = await quote("E2E-TIER");
check("a retail-only coupon is refused for a trade account", r.status === 400 && /not valid for this account/i.test(r.json.error), r.text.slice(0, 140));

await makeCoupon("E2E-SOLO", { stackable: false });
await q("update users set wholesale_discount_pct = 10 where id=$1", [account.id]);
r = await quote("E2E-SOLO");
check("a non-stackable coupon is refused on contract pricing", r.status === 400 && /cannot be combined/i.test(r.json.error), r.text.slice(0, 140));
await q("update users set wholesale_discount_pct = 0 where id=$1", [account.id]);
r = await quote("E2E-SOLO");
check("the same coupon applies without a contract discount", r.status === 200 && r.json.quote.couponDiscount > 0, r.text.slice(0, 140));

// --- a freight coupon waives ground only ------------------------------------------------------
await makeCoupon("E2E-FREIGHT", { kind: "shipping", value: 0 });
r = await quote("E2E-FREIGHT");
const options = r.json.quote.shippingOptions;
const ground = options.find((option) => option.ground);
const air = options.find((option) => !option.ground);
check("ground is free with a freight coupon", r.status === 200 && r.json.quote.shippingCost === 0 && r.json.quote.shippingOptionId === ground.id, r.text.slice(0, 160));
if (air) {
  r = await quote("E2E-FREIGHT", { shippingOptionId: air.id });
  check("the freight coupon does not pay for an air upgrade", r.json.quote.shippingCost > 0, `${r.json.quote.shippingCost}`);
}

// --- redemption is recorded with the order ----------------------------------------------------
const onceId = await makeCoupon("E2E-ONCE", { per_customer_limit: 1 });
const place = async (couponCode) => {
  const priced = await quote(couponCode);
  return buyer.post("/api/orders", {
    items,
    address: NJ,
    couponCode,
    shippingOptionId: priced.json.quote.shippingOptionId,
    checkoutId: randomUUID(),
    email: "buyer@harborhouse.com",
    name: "Dana Whitfield",
    company: "Harbor House",
    phone: "2075550184",
    paymentMethod: "ach",
  });
};
r = await place("E2E-ONCE");
check("an order may be placed with a coupon", r.status === 200 && r.json.orderNumber, r.text.slice(0, 160));
const [used] = await q("select redeemed_count from coupons where id=$1", [onceId]);
const redemptions = await q("select order_id, user_id, amount from coupon_redemptions where coupon_id=$1", [onceId]);
check("the redemption is counted and recorded", used.redeemed_count === 1 && redemptions.length === 1 && redemptions[0].user_id === account.id && redemptions[0].amount > 0, JSON.stringify(redemptions));

r = await quote("E2E-ONCE");
check("the per-customer limit closes the coupon for this account", r.status === 400 && /already been used/i.test(r.json.error), r.text.slice(0, 140));
r = await place("E2E-ONCE");
check("the order endpoint refuses the used-up coupon too", r.status >= 400, r.text.slice(0, 140));
const after = await q("select count(*)::int as count from coupon_redemptions where coupon_id=$1", [onceId]);
check("a refused order does not burn a redemption", after[0].count === 1, JSON.stringify(after));

await q("delete from coupons where code = any($1)", [CODES]);
await done();
