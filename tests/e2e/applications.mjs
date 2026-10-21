// KYT-11: the paperwork behind a wholesale application, and the duplicate-EIN warning.
import { Client, check, done, q, uniq } from "./lib.mjs";

await q("delete from rate_limits");

const email = `applicant-${uniq()}@shop.com`;
const applicant = new Client();
let r = await applicant.post("/api/auth/signup", { name: "Ava Applicant", email, password: "quiet-harbor-42" });
check("the applicant signs up", r.status === 200, r.text.slice(0, 120));
await q("update users set email_verified = true where email=$1", [email]);
await applicant.post("/api/auth/login", { email, password: "quiet-harbor-42" });

const ein = `43-${String(1000000 + Math.floor(Math.random() * 8999999)).slice(0, 7)}`;
const application = {
  companyName: "Dock Street Grocers", businessType: "Other retail", contactName: "Ava Applicant",
  phone: "5551234567", addressLine1: "9 Dock St", city: "Newark", state: "NJ", zip: "07102",
  annualVolume: "100k", categories: "pantry", ein,
};
r = await applicant.post("/api/wholesale/apply", application);
check("the application is filed", r.status === 200, r.text.slice(0, 160));
const [filed] = await q("select id from wholesale_applications where email=$1", [email]);

// --- documents ---------------------------------------------------------------------------------
const upload = async (client, body, type = "application/pdf", name = "certificate.pdf", kind = "resale_certificate") => {
  const form = new FormData();
  form.set("file", new File([body], name, { type }));
  form.set("kind", kind);
  return client.req("POST", "/api/wholesale/documents", form);
};

r = await upload(applicant, new Uint8Array(Buffer.from("not a pdf at all")));
check("a file that is not a document is refused", r.status === 422, r.text.slice(0, 140));

r = await upload(applicant, new Uint8Array(Buffer.from("%PDF-1.7\nresale certificate")));
check("the resale certificate is accepted", r.status === 200, r.text.slice(0, 160));
const docs = await q("select id, kind, mime from application_documents where application_id=$1", [filed.id]);
check("it is stored against the application", docs.length === 1 && docs[0].mime === "application/pdf", JSON.stringify(docs));

r = await applicant.req("GET", "/api/wholesale/documents");
check("the applicant sees what they sent", r.status === 200 && r.json.documents.length === 1, r.text.slice(0, 140));

// --- only staff may open it ----------------------------------------------------------------------
const stranger = new Client();
await stranger.post("/api/auth/login", { email: "customer@example.com", password: "Customer123!" });
r = await stranger.get(`/api/admin/applications/${filed.id}/documents/${docs[0].id}`);
check("another customer cannot open the document", r.status === 403 || r.status === 401, String(r.status));
r = await new Client().get(`/api/admin/applications/${filed.id}/documents/${docs[0].id}`);
check("a guest cannot either", r.status === 403 || r.status === 401, String(r.status));

const admin = new Client();
await admin.post("/api/auth/login", { email: "admin@ciputracorp.com", password: "Admin123!" });
r = await admin.get(`/api/admin/applications/${filed.id}/documents/${docs[0].id}`);
check("the trade desk opens it", r.status === 200 && r.text.startsWith("%PDF"), String(r.status));
const [viewed] = await q("select action from audit_log where entity_type='application' order by id desc limit 1");
check("and the download is in the audit log", viewed?.action === "application.document-view", JSON.stringify(viewed));

// --- the duplicate EIN warning ---------------------------------------------------------------------
const second = new Client();
const secondEmail = `twin-${uniq()}@shop.com`;
await second.post("/api/auth/signup", { name: "Twin Buyer", email: secondEmail, password: "quiet-harbor-42" });
await q("update users set email_verified = true where email=$1", [secondEmail]);
await second.post("/api/auth/login", { email: secondEmail, password: "quiet-harbor-42" });
r = await second.post("/api/wholesale/apply", { ...application, contactName: "Twin Buyer" });
check("a second application with the same EIN is accepted, not silently dropped", r.status === 200, r.text.slice(0, 160));

r = await admin.get("/admin");
check("the desk is warned that the EIN is already in use", r.text.includes("This EIN already appears elsewhere"), "warning missing from /admin");

// --- a closed application takes no more paperwork -------------------------------------------------
await q("update wholesale_applications set status='rejected' where id=$1", [filed.id]);
r = await upload(applicant, new Uint8Array(Buffer.from("%PDF-1.7\nlate")));
check("a rejected application takes no more documents", r.status === 409, r.text.slice(0, 140));

await q("delete from users where email in ($1, $2)", [email, secondEmail]);
await done();
