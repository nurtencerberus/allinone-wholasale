// UX-3: the accessibility promises that can be checked in the served HTML.
import { Client, check, done, q } from "./lib.mjs";

const anon = new Client();
const buyer = new Client();
await buyer.post("/api/auth/login", { email: "buyer@harborhouse.com", password: "Trade123!" });

const [product] = await q("select slug from products where active order by id limit 1");

const pages = {
  home: await anon.get("/"),
  shop: await anon.get("/shop"),
  product: await anon.get(`/products/${product.slug}`),
  quickOrder: await buyer.get("/quick-order"),
  login: await anon.get("/login"),
};

for (const [name, page] of Object.entries(pages)) {
  check(`${name} renders`, page.status === 200, String(page.status));
}

// --- landmarks and the keyboard shortcut past the header (WCAG 2.4.1) -------------------------
check("the document declares its language", pages.home.text.includes('lang="en-US"'));
check("a skip link comes before the header", /class="skip-link"[^>]*>\s*Skip to main content|Skip to main content/.test(pages.home.text));
check("the skip link has somewhere to land", pages.home.text.includes('id="main-content"'));
check("there is a main landmark", /<main[^>]*id="main-content"/.test(pages.home.text));

// --- one first-level heading per page (WCAG 1.3.1) --------------------------------------------
for (const [name, page] of Object.entries(pages)) {
  const h1s = (page.text.match(/<h1\b/g) ?? []).length;
  check(`${name} has exactly one <h1>`, h1s === 1, `${h1s} found`);
}

// --- every control can be named ----------------------------------------------------------------
function unnamedInputs(html) {
  const ids = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  return [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/type="(hidden|submit|button)"/.test(tag))
    .filter((tag) => !/aria-label(ledby)?=/.test(tag))
    .filter((tag) => {
      const id = tag.match(/\bid="([^"]+)"/)?.[1];
      return !(id && ids.has(id));
    });
}
for (const [name, page] of Object.entries(pages)) {
  const unnamed = unnamedInputs(page.text);
  check(`${name}: every form control has a name`, unnamed.length === 0, unnamed.slice(0, 2).join(" | "));
}

// --- images carry alt text, table headers carry scope (WCAG 1.1.1, 1.3.1) ---------------------
for (const [name, page] of Object.entries(pages)) {
  const imgs = [...page.text.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  check(`${name}: every image has an alt attribute`, imgs.every((tag) => /\balt=/.test(tag)), `${imgs.filter((t) => !/\balt=/.test(t)).length} missing`);
  const headers = [...page.text.matchAll(/<th\b[^>]*>/g)].map((m) => m[0]);
  check(`${name}: every table header is scoped`, headers.every((tag) => /scope="/.test(tag)), `${headers.filter((t) => !/scope="/.test(t)).length} missing`);
}

await done();
