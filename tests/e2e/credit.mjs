// ODE-6: Net-30 is credit. An order on terms is refused when the account is on hold, has
// something past due, or would cross its limit — and the invoice carries a due date.
import { randomUUID } from "node:crypto";
import { Client, check, done, q, setStock } from "./lib.mjs";

await q("delete from rate_limits");
const buyer = new Client();
let r = await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });
check("trade buyer login", r.status === 200, r.text.slice(0, 120));
const admin = new Client();
await admin.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" });

const [account] = await q("select id from users where email='buyer@harborhouse.com'");
await q("update users set company_id=null, company_role=null, credit_hold=false where id=$1", [account.id]);
await q("delete from orders where user_id=$1", [account.id]);

const [product] = await q("select id, case_price, min_cases from products where active and tax_class='general' order by case_price desc limit 1");
await setStock(product.id, 2000);
const NJ = { line1: "238 Lindbergh Pl", city: "Paterson", state: "NJ", zip: "07503" };
const cases = Math.max(product.min_cases, Math.ceil(200_000 / product.case_price));
const quote = () => buyer.post("/api/checkout/quote", { items: [{ productId: product.id, cases }], address: NJ });
const order = async (po = "PO-1") => {
  const priced = await quote();
  return buyer.post("/api/orders", {
    items: [{ productId: product.id, cases }],
    address: NJ,
    shippingOptionId: priced.json.quote.shippingOptionId,
    checkoutId: randomUUID(),
    email: "buyer@harborhouse.com",
    name: "Dana Whitfield",
    company: "Harbor House",
    phone: "2075550184",
    paymentMethod: "net30",
    poNumber: po,
  });
};
const orderTotal = (await quote()).json.quote.total;

// --- no limit means no terms --------------------------------------------------------------------
await q("update users set credit_limit=0, payment_terms_days=30 where id=$1", [account.id]);
r = await order();
check("an account with no credit limit cannot order on terms", r.status === 402 && /no invoice credit/i.test(r.json.error), r.text.slice(0, 160));

// --- the limit is set by the trade desk -----------------------------------------------------------
r = await admin.req("PUT", `/api/admin/accounts/${account.id}/credit`, { creditLimit: (orderTotal * 1.5) / 100, paymentTermsDays: 30 });
check("the desk sets a limit", r.status === 200, r.text.slice(0, 160));

r = await order("PO-FIRST");
check("the first order on terms goes through", r.status === 200 && r.json.orderNumber, r.text.slice(0, 160));
const firstOrder = r.json.orderNumber;
const [invoice] = await q("select due_at, payment_status, total from orders where order_number=$1", [firstOrder]);
check("the invoice carries a due date 30 days out", invoice.payment_status === "net30_invoice" && invoice.due_at, JSON.stringify(invoice));
const days = Math.round((new Date(invoice.due_at) - Date.now()) / 86_400_000);
check("the due date follows the account's terms", days >= 29 && days <= 30, `${days} days`);

// --- the limit actually bites -----------------------------------------------------------------------
r = await order("PO-SECOND");
check("a second order that would cross the limit is refused", r.status === 402 && /credit limit/i.test(r.json.error), r.text.slice(0, 200));
check("the refusal says what is still available", /available/i.test(r.json.error ?? ""), r.json?.error);

// --- card and ACH are unaffected -----------------------------------------------------------------------
const priced = await quote();
r = await buyer.post("/api/orders", {
  items: [{ productId: product.id, cases }],
  address: NJ,
  shippingOptionId: priced.json.quote.shippingOptionId,
  checkoutId: randomUUID(),
  email: "buyer@harborhouse.com",
  name: "Dana Whitfield",
  phone: "2075550184",
  paymentMethod: "ach",
});
check("the same cart still goes through on ACH", r.status === 200, r.text.slice(0, 160));
await q("delete from orders where order_number=$1", [r.json?.orderNumber]);

// --- past due blocks everything -------------------------------------------------------------------------
await q("update users set credit_limit = $2 where id=$1", [account.id, orderTotal * 10]);
await q("update orders set due_at = now() - interval '5 days' where order_number=$1", [firstOrder]);
r = await order("PO-THIRD");
check("anything past due blocks a new order on terms", r.status === 402 && /past due/i.test(r.json.error), r.text.slice(0, 200));

// --- the aging report sees it ------------------------------------------------------------------------------
r = await admin.get("/admin/reports/ar");
check("the receivables report opens", r.status === 200 && r.text.includes("Receivables"), String(r.status));
check("it shows the overdue amount", r.text.includes("Past due"), "heading missing");

// --- a hold stops terms whatever the numbers say --------------------------------------------------------------
await q("update orders set due_at = now() + interval '20 days' where order_number=$1", [firstOrder]);
await q("update users set credit_hold = true where id=$1", [account.id]);
r = await order("PO-FOURTH");
check("a credit hold refuses the order", r.status === 402 && /credit hold/i.test(r.json.error), r.text.slice(0, 200));
await q("update users set credit_hold = false where id=$1", [account.id]);

// --- settle and the account can buy again ----------------------------------------------------------------------
await q("update orders set payment_status='paid' where order_number=$1", [firstOrder]);
r = await order("PO-FIFTH");
check("once the invoice is settled, terms work again", r.status === 200, r.text.slice(0, 200));

await q("delete from orders where user_id=$1", [account.id]);
await q("update users set credit_limit=0, credit_hold=false where id=$1", [account.id]);
await done();
