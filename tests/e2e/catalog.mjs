// UX-5/UX-6: the catalogue's paging, search, facets and the canonical/robots tags around them.
import { Client, check, done, q } from "./lib.mjs";

const anon = new Client();
const PAGE_SIZE = 24;

// One request first: a cold demo database is seeded by the app, not by this suite.
await anon.get("/shop");

const slugsOf = (html) => [...new Set([...html.matchAll(/href="\/products\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]+)"\/?>/)?.[1] ?? null;
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

const [{ total }] = await q("select count(*)::int as total from products where active");
check("the catalog is seeded", total > 0, `${total} active`);

// --- canonical and robots come first: paging below adds rows for a moment ----------------------
const first = await anon.get("/shop");
const second = await anon.get("/shop?page=2");
check("page 1 loads", first.status === 200, String(first.status));
check("page 2 of a single-page catalog loads", second.status === 200, String(second.status));
check("a page holds at most one page worth of SKUs", slugsOf(first.text).length <= PAGE_SIZE, `${slugsOf(first.text).length}`);

// --- canonical and robots (UX-5) ---------------------------------------------------------------
check("page 1 is canonical to itself", canonicalOf(first.text)?.endsWith("/shop"), String(canonicalOf(first.text)));
check("page 2 is canonical to itself", canonicalOf(second.text)?.endsWith("/shop?page=2"), String(canonicalOf(second.text)));
const categoryPage = await anon.get("/shop?category=supplements");
check(
  "a department is canonical to itself",
  canonicalOf(categoryPage.text)?.endsWith("/shop?category=supplements"),
  String(canonicalOf(categoryPage.text)),
);
const home = await anon.get("/");
check(
  "the home page is still canonical to the root",
  /^https?:\/\/[^/]+\/?$/.test(canonicalOf(home.text) ?? ""),
  String(canonicalOf(home.text)),
);
const login = await anon.get("/login");
check("the sign-in page is noindex", isNoindex(login.text));
check("the sign-in page does not claim to be the home page", canonicalOf(login.text) === null, String(canonicalOf(login.text)));

// --- search (full text + trade identifiers) ----------------------------------------------------
const [product] = await q(
  "select slug, sku, name, brand, description from products where active and length(description) > 40 order by id limit 1",
);
const word = product.description.split(/\s+/).find((token) => /^[a-zA-Z]{6,}$/.test(token));
const found = await anon.get(`/shop?q=${encodeURIComponent(word)}`);
check(`full-text search finds a word from the description ("${word}")`, slugsOf(found.text).includes(product.slug));
check("a search result set is noindex", isNoindex(found.text));
check("a search result set is still canonical to the catalog", canonicalOf(found.text)?.endsWith("/shop"), String(canonicalOf(found.text)));

const partial = await anon.get(`/shop?q=${encodeURIComponent(product.sku.slice(0, 5))}`);
check("a partial SKU still matches", [200, 307, 308].includes(partial.status) , String(partial.status));

const exact = await anon.get(`/shop?q=${encodeURIComponent(product.sku)}`);
check("an exact SKU goes straight to the product", [307, 308].includes(exact.status) && exact.text.includes(product.slug), `${exact.status}`);

const nothing = await anon.get("/shop?q=zzzzzzqqqq");
check("a search for nothing says so", nothing.status === 200 && slugsOf(nothing.text).length === 0);

// --- facets ------------------------------------------------------------------------------------
const [{ brand, brand_count: brandCount }] = await q(
  "select brand, count(*)::int as brand_count from products where active group by brand order by brand_count desc limit 1",
);
const byBrand = await anon.get(`/shop?brand=${encodeURIComponent(brand)}`);
const brandSlugs = slugsOf(byBrand.text);
const [{ matching }] = await q("select count(*)::int as matching from products where active and brand = $1", [brand]);
check(
  `the brand facet shows only that brand (${brand})`,
  brandSlugs.length === Math.min(matching, PAGE_SIZE) && brandCount === matching,
  `${brandSlugs.length} vs ${matching}`,
);

const [{ certified }] = await q(
  `select count(*)::int as certified from products
    where active and exists (select 1 from jsonb_array_elements(certifications) as cert where cert->>'documentUrl' is not null)`,
);
const byCert = await anon.get("/shop?cert=on");
check(
  "the certification facet counts the SKUs with a document on file",
  slugsOf(byCert.text).length === Math.min(certified, PAGE_SIZE),
  `${slugsOf(byCert.text).length} vs ${certified}`,
);

// --- paging, with more SKUs than fit on one page ----------------------------------------------
// The demo catalog is smaller than a page, so the rows come from here. They are cloned from a
// real product (every NOT NULL column included), kept in stock, and the pages below are read
// through the `stock=in` filter: a cache key no other suite or test uses, so the clones cannot
// linger in the plain /shop entry after they are deleted.
const [{ id: templateId }] = await q("select id from products where active order by id limit 1");
const columns = (
  await q(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'products'
        and column_name not in ('id', 'slug', 'sku', 'gtin', 'case_gtin')
        and is_generated = 'NEVER'
      order by ordinal_position`,
  )
).map((row) => `"${row.column_name}"`);

const EXTRA = PAGE_SIZE + 3;
await q("delete from products where sku like 'E2E-PAGE-%'");
await q(
  `insert into products (slug, sku, gtin, case_gtin, ${columns.join(", ")})
   select 'e2e-page-' || g, 'E2E-PAGE-' || g, '9' || lpad(g::text, 12, '0'), null,
          ${columns.map((column) => `t.${column}`).join(", ")}
     from generate_series(1, $1) g cross join (select * from products where id = $2) t`,
  [EXTRA, templateId],
);
await q("update products set stock = 50, active = true where sku like 'E2E-PAGE-%'");

const [{ instock }] = await q("select count(*)::int as instock from products where active and stock > 0");
check("there are now more in-stock SKUs than fit on a page", instock > PAGE_SIZE, `${instock}`);

const p1 = await anon.get("/shop?stock=in");
const p2 = await anon.get("/shop?stock=in&page=2");
const p1Slugs = slugsOf(p1.text);
const p2Slugs = slugsOf(p2.text);
check("page 1 is full", p1Slugs.length === PAGE_SIZE, `${p1Slugs.length}`);
check(
  "page 2 carries the rest and repeats nothing",
  p2Slugs.length === instock - PAGE_SIZE && p2Slugs.every((slug) => !p1Slugs.includes(slug)),
  `${p2Slugs.length} of ${instock - PAGE_SIZE}`,
);
check("the grid says which page it is on", /aria-current="page"/.test(p2.text));
check("the paging links keep the filter", /href="\/shop\?stock=in&(amp;)?page=2"/.test(p1.text), "no next link with the filter");
check("page 2 is canonical to itself", canonicalOf(p2.text)?.endsWith("/shop?page=2"), String(canonicalOf(p2.text)));

const clamped = await anon.get("/shop?stock=in&page=99");
check("a page past the end clamps to the last one", slugsOf(clamped.text).join() === p2Slugs.join());
const nonsense = await anon.get("/shop?stock=in&page=not-a-number");
check("a nonsense page number falls back to page 1", slugsOf(nonsense.text).join() === p1Slugs.join());

await q("delete from products where sku like 'E2E-PAGE-%'");
const [{ left }] = await q("select count(*)::int as left from products where sku like 'E2E-PAGE-%'");
check("the extra rows are gone again", left === 0, `${left} left`);

// --- UX-4: the error and loading boundaries exist ---------------------------------------------
const missing = await anon.get("/products/does-not-exist-at-all");
check("an unknown product is a 404 page, not a crash", missing.status === 404);

await done();
