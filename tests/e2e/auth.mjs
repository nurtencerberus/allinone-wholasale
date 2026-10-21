import { createHash } from "node:crypto";
import { BASE, Client, check, done, q, uniq } from "./lib.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");
await q("delete from rate_limits");

const email = `buyer-${uniq()}@shop.com`;
const app = {
  companyName: "Shop LLC", businessType: "Other retail", contactName: "T", phone: "5551234567",
  addressLine1: "1 Main", city: "Newark", state: "NJ", zip: "07102", annualVolume: "x", categories: "x",
};

const a = new Client();
let r = await a.post("/api/auth/signup", { name: "Test Buyer", email, password: "warehouse-tulip-42" });
check("signup ok", r.status === 200, r.text.slice(0, 80));
check("signing up does not sign the browser in (KYT-8)", r.json?.user === undefined && r.json?.pendingVerification === true, r.text.slice(0, 120));
r = await a.post("/api/auth/login", { email, password: "warehouse-tulip-42" });
check("the new account can sign in", r.status === 200, r.text.slice(0, 120));
const [u] = await q("select id, verification_token from users where email=$1", [email]);
check("verification token stored as 64-char digest", u.verification_token?.length === 64);

r = await a.post("/api/auth/resend-verification");
const verifyUrl = r.json?.devVerifyUrl ?? "";
const vtok = new URL(verifyUrl).searchParams.get("token");
check("verify link uses app origin, not request host", verifyUrl.startsWith(`${BASE}/verify-email`), verifyUrl);
check("stored digest matches link token", (await q("select verification_token from users where id=$1", [u.id]))[0].verification_token === sha(vtok));

r = await a.post("/api/wholesale/apply", { ...app, ein: "12-3456789" });
check("apply blocked while unverified", r.status === 403, r.text);

r = await new Client().post("/api/auth/verify", { token: vtok });
check("verify ok", r.status === 200, r.text);
r = await new Client().post("/api/auth/verify", { token: vtok });
check("verify token single-use", r.status === 400);

r = await new Client().post("/api/wholesale/apply", { ...app, ein: "12-3456789" });
check("apply blocked for guest", r.status === 401);

r = await a.post("/api/wholesale/apply", { ...app, ein: "00-3456789" });
check("invalid EIN prefix rejected", r.status === 400, r.text);

r = await a.post("/api/wholesale/apply", { ...app, ein: "12-3456789", email: "victim@x.com" });
check("apply ok when verified", r.status === 200, r.text);
const apps = await q("select id, email, user_id, status from wholesale_applications where user_id=$1", [u.id]);
check("application bound to session user and email", apps.length === 1 && apps[0].email === email, JSON.stringify(apps));
r = await a.post("/api/wholesale/apply", { ...app, ein: "12-3456789" });
check("duplicate pending application rejected", r.status === 409);

// Admin approval must not touch e-mail verification and must target the applicant only.
const admin = new Client();
r = await admin.post("/api/auth/login", { email: "admin@meridiansupply.co", password: "Admin123!" });
check("admin login", r.status === 200, r.text.slice(0, 80));
const squatter = `sq-${uniq()}@shop.com`;
await new Client().post("/api/auth/signup", { name: "Squatter", email: squatter, password: "squatter-tulip-42" });
await q("update wholesale_applications set email=$1 where id=$2", [squatter, apps[0].id]); // simulate e-mail mismatch
r = await admin.req("PATCH", `/api/admin/applications/${apps[0].id}`, { action: "approve", discountPct: 5, verifyEin: true });
check("approve ok", r.status === 200, r.text);
const [sq] = await q("select account_tier, email_verified from users where email=$1", [squatter]);
check("account matched only by e-mail is NOT upgraded or verified", sq.account_tier === "retail" && sq.email_verified === false, JSON.stringify(sq));
const [me] = await q("select account_tier from users where id=$1", [u.id]);
check("applicant account upgraded", me.account_tier === "wholesale");
r = await admin.req("PATCH", `/api/admin/applications/${apps[0].id}`, { action: "reject", reason: "changed my mind" });
check("decided application cannot be decided again", r.status === 409);

// Password reset: digest storage, single use, sessions revoked.
r = await new Client().post("/api/auth/forgot-password", { email });
const rtok = new URL(r.json.devResetUrl).searchParams.get("token");
check("reset token stored as digest", (await q("select reset_token from users where id=$1", [u.id]))[0].reset_token === sha(rtok));
r = await new Client().post("/api/auth/reset-password", { token: rtok, password: "NewPassw0rd!" });
check("reset ok", r.status === 200, r.text);
r = await new Client().post("/api/auth/reset-password", { token: rtok, password: "Other123!x" });
check("reset token single-use", r.status === 400);
r = await a.get("/account");
check("old session revoked after reset", r.status === 307, String(r.status));
r = await new Client().post("/api/auth/login", { email, password: "NewPassw0rd!" });
check("login with new password", r.status === 200);

// Login rotation: an existing session cookie is replaced, the old row deleted.
const b = new Client();
await b.post("/api/auth/login", { email, password: "NewPassw0rd!" });
const before = (await q("select count(*)::int c from sessions where user_id=$1", [u.id]))[0].c;
await b.post("/api/auth/login", { email, password: "NewPassw0rd!" });
const after = (await q("select count(*)::int c from sessions where user_id=$1", [u.id]))[0].c;
check("re-login in same browser does not accumulate sessions", after === before, `${before} -> ${after}`);

// Open redirect
r = await new Client().get("/login?next=https://evil.example");
check("external next is dropped", !/\\"next\\":\\"https:\/\/evil/.test(r.text));
r = await new Client().get("/login?next=//evil.example");
check("protocol-relative next is dropped", !/\\"next\\":\\"\/\/evil/.test(r.text));
r = await new Client().get("/login?next=/checkout");
check("same-site next kept", /\\"next\\":\\"\/checkout/.test(r.text));

// Unknown account login is rejected (timing is equalised; not measured here).
r = await new Client().post("/api/auth/login", { email: `nobody-${uniq()}@x.com`, password: "whatever123" });
check("unknown account 401", r.status === 401);

await done();
