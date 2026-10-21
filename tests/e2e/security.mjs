// KYT-6/8/10: the cross-site guard, account enumeration, password rules and session handling.
import { BASE, Client, check, done, q, uniq } from "./lib.mjs";

await q("delete from rate_limits");

// --- KYT-6: a state-changing API call must come from our own origin --------------------------
let response = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ email: "buyer@harborhouse.com", password: "Trade123!" }),
});
check("a cross-site origin is refused", response.status === 403, String(response.status));

response = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: JSON.stringify({ email: "buyer@harborhouse.com", password: "Trade123!" }),
});
check("a text/plain body is refused", response.status === 415, String(response.status));

response = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: "buyer@harborhouse.com", password: "nope" }),
});
check("our own origin gets through to the route", response.status === 401, String(response.status));

response = await fetch(`${BASE}/shop`, { headers: { origin: "https://evil.example" } });
check("pages are not touched by the guard", response.status === 200, String(response.status));

// --- KYT-8: signing up never says whether an address is already taken -------------------------
const fresh = `probe-${uniq()}@shop.com`;
const client = new Client();
let r = await client.post("/api/auth/signup", { name: "Probe One", email: fresh, password: "quiet-harbor-42" });
const firstAnswer = { status: r.status, body: { ...r.json, devVerifyUrl: undefined, verificationSent: undefined } };
check("a new address is accepted", r.status === 200 && r.json.pendingVerification === true, r.text.slice(0, 120));

r = await new Client().post("/api/auth/signup", { name: "Probe Two", email: fresh, password: "quiet-harbor-42" });
const secondAnswer = { status: r.status, body: { ...r.json, devVerifyUrl: undefined, verificationSent: undefined } };
check(
  "a taken address answers exactly the same way",
  JSON.stringify(firstAnswer) === JSON.stringify(secondAnswer),
  `${JSON.stringify(firstAnswer)} vs ${JSON.stringify(secondAnswer)}`,
);
const rows = await q("select count(*)::int as count from users where email=$1", [fresh]);
check("and no second account is created", rows[0].count === 1, JSON.stringify(rows));

// --- KYT-10: password rules -------------------------------------------------------------------
r = await new Client().post("/api/auth/signup", { name: "Weak", email: `weak-${uniq()}@shop.com`, password: "short1!" });
check("a short password is refused", r.status === 400 && /at least 10/i.test(r.json.error), r.text.slice(0, 120));
r = await new Client().post("/api/auth/signup", { name: "Weak", email: `weak-${uniq()}@shop.com`, password: "Passw0rd!!" });
check("a common password with padding is refused", r.status === 400 && /attacker/i.test(r.json.error), r.text.slice(0, 120));

// --- KYT-10: changing the password signs other browsers out ------------------------------------
const owner = new Client();
await owner.post("/api/auth/login", { email: fresh, password: "quiet-harbor-42" });
const other = new Client();
await other.post("/api/auth/login", { email: fresh, password: "quiet-harbor-42" });
r = await other.get("/account");
check("the second browser is signed in", r.status === 200, String(r.status));

r = await owner.post("/api/account/password", { action: "change", currentPassword: "wrong-one-here", newPassword: "another-quiet-harbor-43" });
check("the current password is required", r.status === 403, r.text.slice(0, 120));

r = await owner.post("/api/account/password", { action: "change", currentPassword: "quiet-harbor-42", newPassword: "another-quiet-harbor-43" });
check("the password is changed", r.status === 200, r.text.slice(0, 140));
r = await other.get("/account");
check("the other browser is signed out", r.status === 307 || r.status === 401 || r.text.includes("Sign in"), String(r.status));
r = await owner.get("/account");
check("the browser that changed it stays signed in", r.status === 200, String(r.status));
r = await new Client().post("/api/auth/login", { email: fresh, password: "another-quiet-harbor-43" });
check("the new password works", r.status === 200, r.text.slice(0, 120));

// --- KYT-10: a staff session is short -----------------------------------------------------------
const staff = new Client();
await staff.post("/api/auth/login", { email: "admin@ciputracorp.com", password: "Admin123!" });
const [staffSession] = await q(
  `select s.expires_at from sessions s join users u on u.id = s.user_id where u.email='admin@ciputracorp.com' order by s.expires_at desc limit 1`,
);
const staffHours = staffSession ? (new Date(staffSession.expires_at) - Date.now()) / 3_600_000 : 0;
check("a staff session lasts hours, not a month", staffHours > 1 && staffHours <= 8.1, `${staffHours.toFixed(1)}h`);

const [buyerSession] = await q(
  `select s.expires_at from sessions s join users u on u.id = s.user_id where u.email=$1 order by s.expires_at desc limit 1`,
  [fresh],
);
const buyerDays = buyerSession ? (new Date(buyerSession.expires_at) - Date.now()) / 86_400_000 : 0;
check("a customer session still lasts a month", buyerDays > 25, `${buyerDays.toFixed(1)}d`);

await q("delete from users where email=$1", [fresh]);
await done();
