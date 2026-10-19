import { Client, check, done, q, uniq } from "./lib.mjs";
await q("delete from rate_limits");
const email = `victim-${uniq()}@x.com`;
const number = `MSC-${Math.floor(1e6 + Math.random() * 8e6)}`;
await q(
  `insert into orders (order_number, email, customer_name, shipping_address, shipping_service, shipping_carrier, subtotal, total, user_id)
   values ($1, $2, 'Vic Tim', '{}'::jsonb, 'Ground', 'UPS', 100, 100, null)`,
  [number, email],
);
const c = new Client();
let r = await c.post("/api/auth/signup", { name: "Squat", email, password: "Passw0rd!x" });
check("squatter signs up with the guest's e-mail", r.status === 200, r.text.slice(0, 80));
r = await c.get("/account");
check("unverified account page loads", r.status === 200, String(r.status));
check("guest order with same e-mail hidden while unverified", !r.text.includes(number));
await q("update users set email_verified=true where email=$1", [email]);
r = await c.get("/account");
check("shown once the e-mail is verified", r.text.includes(number));
await done();
