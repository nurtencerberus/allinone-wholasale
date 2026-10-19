# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

**Ciputra Corp.** (eski adı Meridian Supply Co.; çerez ve bazı iç adlar hâlâ `meridian`) — ABD pazarına yönelik B2B toptan satış mağazası (takviyeler, kiler ürünleri, ev eşyası).
Next.js 16 App Router + React 19, PostgreSQL + Drizzle ORM, Tailwind CSS 4, Stripe. Hedef dağıtım: Vercel + Neon
(`ciputracorp.com`). Durum: demo / MVP — canlıya çıkmadan önce kalan işler ve faz planı `IS-PLANI.md`'de
(madde kodları: ODE, KYT, SEP, STK, VRG, KRG, URN, UX, PRF, DEV). Kullanıcıya dönük dokümanlar (DEPLOYMENT, MIGRATION, İNCELEME) Türkçe;
kod, yorumlar ve arayüz metinleri İngilizce (ABD pazarı).

## Komutlar

```bash
npm install
cp .env.example .env                     # yalnızca DATABASE_URL zorunlu
psql "$DATABASE_URL" -f db/schema.sql    # yalnızca BOŞ veritabanında, bir kez
npm run dev                              # http://localhost:3000
npm run build                            # DATABASE_URL olmadan da derlenir (bkz. src/db/index.ts)
npm run lint                             # eslint . (flat config, eslint-config-next core-web-vitals)
npm run typecheck                        # tsc --noEmit
```

Şema değişikliği — `src/db/schema.ts` değiştiğinde üçünü birden yapın:

```bash
npm run db:export        # db/schema.sql'i yeniden üretir (boş veritabanı kurulumu; CI senkron olduğunu kontrol eder)
# + db/migrations/NNNN_*.sql: mevcut (Neon) veritabanı için artımlı, tekrar çalıştırılabilir SQL (IF NOT EXISTS,
#   FK adları Drizzle'ınkiyle aynı: <tablo>_<sütun>_<hedef>_<sütun>_fk)
```

Testler:

```bash
npm test                                   # Vitest birim testleri (tests/unit): vergi, adres, fiyat, erişim
npx vitest run tests/unit/tax.test.ts      # tek dosya;  -t "<ad>" ile tek test
npm run test:e2e                           # tests/e2e: çalışan sunucuya (BASE) ve test veritabanına (E2E_DATABASE_URL) karşı
```

E2E paketleri demo seed'e (`SEED_DEMO_DATA=true`) ve sahte Stripe'a (`node tests/e2e/fake-stripe.mjs`, port 12111,
uygulamada `STRIPE_API_BASE=http://127.0.0.1:12111`, `STRIPE_SECRET_KEY=sk_test_fake`,
`STRIPE_WEBHOOK_SECRET=whsec_testsecret`, `CRON_SECRET=testcronsecret`) ihtiyaç duyar; uzak/Neon veritabanına karşı
çalışmayı reddeder. Tam kurulum `.github/workflows/ci.yml`'de (Postgres servisi + `next start`).
`GET /api/health` hızlı bir canlılık kontrolüdür.

Demo girişleri (yalnızca demo modunda): `admin@meridiansupply.co / Admin123!`, `buyer@harborhouse.com / Trade123!`,
`customer@example.com / Customer123!`.

## Mimari

### Demo modu ↔ canlı mod (en önemli anahtar)
`src/lib/demo-mode.ts` → `demoModeEnabled()`. `SEED_DEMO_DATA` boşsa demo yalnızca `NODE_ENV !== "production"`
iken açıktır; canlıda `false` olmalıdır. Bu anahtar şunları belirler:
- **Seed:** `src/lib/seed.ts` → `ensureSeeded()` (globalThis üzerinde tek seferlik promise). Veri çeken route'lar ve
  sayfalar ilk istekte bunu çağırır. Demo modda katalog (`src/lib/catalog.ts`), yorumlar, kuponlar, demo hesaplar,
  örnek siparişler ve örnek toptan listeler oluşturulur; canlı modda hiçbir şey seed edilmez.
- **Ödeme:** Stripe anahtarı yoksa demo modda kart ödemesi simüle edilir (`paid_demo`), canlı modda reddedilir (503).
- **Hesap bağlantıları:** E-posta gönderilemezse doğrulama/sıfırlama linki yalnızca demo modda yanıtta döner.
  Canlı modda bu linkleri asla API yanıtına koymayın (hesap ele geçirme).
- **Uydurma içerik:** Ana sayfa istatistikleri, sertifika şeridi ve referanslar canlı modda gizlenir. Yeni sahte/örnek
  içerik eklerseniz aynı koşula bağlayın. Puan/yıldız yalnızca gerçek `reviews` satırlarından hesaplanır
  (`products.rating_x10/review_count` gösterilmez).

### İşletme kuralları (IS-PLANI.md §4 — kodda zorunlu)
- **Fiyat kilidi:** fiyat, sepet, hızlı sipariş, ödeme, sipariş formu ve tedarikçi listeleri yalnızca
  `canSeePrices(user)` (`src/lib/access.ts`; onaylı `accountTier === "wholesale"` veya admin) için. Kilit **sunucuda**:
  istemci bileşenlerine `toCardProduct(product, showPrices)` (`src/lib/catalog-view.ts`) ile dar veri gidir, kilitliyken
  `casePrice: null`. Tam `Product` nesnesini client bileşenine geçmeyin — tip denetimi bunu yakalamaz, fiyat RSC
  verisine sızar. Fiyat içeren her yeni API `canSeePrices` kontrolü yapmalı (yoksa 403 + `PRICE_LOCKED_MESSAGE`).
  Misafir ödemesi yok.
- **Teslimat:** 48 bitişik eyalet + DC; ZIP eyaleti belirler (`src/lib/ship-to.ts` → `shipToProblem`), PO Box yok.
- **Vergi:** yalnızca NJ (`NEXUS` in `src/lib/tax.ts`); `products.tax_class` (general/food/supplement/candy) — NJ'de
  food ve supplement muaf, kargo vergili mala oranla vergilenir; muafiyet NJ sertifika no + süre ister.
- **Asgari sipariş $150** ve ürün başı `minCases` zorunlu. Toptan başvuru doğrulanmış hesaba bağlıdır.

### Dış entegrasyonlar — hepsi isteğe bağlı, anahtar yoksa yerleşik yedek
| Entegrasyon | Dosya | Yedek |
|---|---|---|
| Stripe (Elements + manuel capture) | `src/lib/card-checkout.ts`, `api/checkout/payment-intent`, `api/orders`, `api/stripe/webhook` | Demo simülasyonu / kapalı |
| EasyPost | `src/lib/shipping.ts` | Boyutsal ağırlık + bölge matrisi; palet → LTL |
| Resend | `src/lib/email.ts` | Konsola log (`provider: "console"`) |

`NEXT_PUBLIC_*` değişkenleri (site URL'si, Stripe publishable key) **derleme zamanında** gömülür.

### Para ve fiyatlandırma
- Tüm para değerleri **sent cinsinden integer** (`casePrice`, `msrpUnit`, toplamlar). Görüntüleme için
  `formatMoney()` (`src/lib/money.ts`). Vergi oranı `rateX1000` = binde (66.25 → %6.625).
- Satış birimi **koli (case)**; `caseSize` koli başına adet, `minCases`, `priceTiers` (koli adedine göre kademeli fiyat).
- **Tek fiyat kaynağı `priceCart()`** (`src/lib/checkout.ts`): kademe fiyatı → toptan hesap indirimi (en fazla %40) →
  kupon (satırlara `allocateDiscount` ile dağıtılır) → adres kontrolü → kargo (`quoteShipping`) → vergi (`quoteTax`).
  Sorunları sessizce düzeltmez, **`blockers`** listesi döner (asgari koli/tutar, stok, >999 koli, teslimat bölgesi,
  bulunamayan kargo seçeneği); pasif ürünler `removedProductIds` + mesajla çıkarılır. `/api/checkout/quote` engelleri
  gösterir; `/payment-intent` ve `/api/orders` engel varken reddeder. İstemciden gelen fiyata asla güvenilmez; fiyat
  kuralı değişikliği yalnızca buraya yapılmalı.
- Sabitler (asgari sipariş, ücretsiz kargo eşiği, çıkış ZIP'i/eyaleti, iletişim bilgisi) `src/lib/site.ts` → `SITE`.

### Sipariş oluşturma
- `createOrderRecord()` (`src/lib/orders.ts`): stok düşümü + sipariş + kalemler **tek transaction**'da, koşullu
  `stock >= cases`; rastgele `MSC-xxxxxxx` (çakışmada yeniden dener). `cancelOrderAndRestock()` iptal + stok iadesi.
- **Kart** (`src/lib/card-checkout.ts`): `payment-intent` PaymentIntent'i `capture_method: "manual"` ile açar ve tüm
  checkout'u (`checkout_sessions.payload`) kaydeder. `finalizeCardCheckout(pi)` siparişi bu taslaktan yeniden fiyatlayarak
  oluşturur, sonra capture eder; herhangi bir hata provizyonu iptal eder (müşteriden para çekilmez). Tarayıcı
  (`/api/orders`), Stripe webhook'u ve günlük cron aynı fonksiyonu çağırır; `checkout_sessions` satırını
  `open → finalizing` olarak sahiplenen tek çağrı çalışır. 3DS dönüşü `/checkout/complete`.
- **ACH / Net-30:** istemcinin `checkoutId`'si `orders.idempotency_key` (`<userId>:<checkoutId>`) olur; tekrar gönderim
  aynı siparişi döner. 7 gün ödenmeyen ACH siparişi cron'da iptal + stok iadesi.
- Cron: `vercel.json` → `GET /api/cron/maintenance` (`Authorization: Bearer $CRON_SECRET`).

Sipariş sayfası erişimi `canViewOrder()` (`src/lib/order-access.ts`): admin, sahibi, doğrulanmış aynı e-posta veya
`accessToken` (URL `?token=` ya da `mo_<orderNumber>` çerezi). Misafir siparişleri bu token'a dayanır.

### Kimlik doğrulama
`src/lib/auth.ts`: scrypt parola (`src/lib/password.ts`), `meridian_session` httpOnly çerezi; veritabanında yalnızca
token'ın SHA-256 özeti saklanır. Middleware/proxy **yok** — her sayfa/route kendi kontrolünü yapar:
`getSessionUser()` veya `requireAdmin()` (null ise 401/redirect). Yeni admin route'u eklerken bu kontrolü unutmayın.
Sıfırlama/doğrulama jetonları da yalnızca `digestToken()` özeti olarak saklanır ve tek `UPDATE … RETURNING` ile tüketilir.
E-posta linkleri `appOrigin()`'den (`src/lib/site.ts`) üretilir, istek Host'undan değil. `?next=` → `safeNextPath()`.
E-posta doğrulanmamış kullanıcı sipariş veremez. Canlıda ilk admin SQL ile atanır (DEPLOYMENT.md §3.3).

### Hız sınırlama
`src/lib/rate-limit.ts` → `consumeRateLimit(scope, key, limit, windowSeconds)`; Postgres `rate_limits` tablosunda
sabit pencere (serverless örnekler arasında paylaşılır, in-memory kullanmayın). `clientIp()` + `tooManyRequests()`
ile birlikte giriş, kayıt, şifre sıfırlama, sipariş, ödeme niyeti, başvuru ve yüklemelerde kullanılır.

### Dosyalar ve tablolar (Excel/CSV)
- Yalnızca **`exceljs`** kullanılır (`src/lib/spreadsheet.ts`); `xlsx` paketi güvenlik nedeniyle kaldırıldı, tekrar
  eklemeyin. Eski `.xls` (BIFF) okunamaz — 422 ile "`.xlsx` veya `.csv` kaydedin" mesajı verilir.
- CSV dışa aktarımında `= + - @` ile başlayan hücreler formül enjeksiyonuna karşı öneklenir.
- Hızlı sipariş formu: `src/lib/order-sheet.ts` (`ORDER_COLUMNS` hem üretim hem ayrıştırma için ortak şema).
- Tedarikçi fiyat listeleri: `src/lib/wholesale-lists.ts`; dosyalar veritabanında saklanır. Fiyat içerdikleri için
  `audience` değerinden bağımsız **hepsi** `canSeePrices` ister. `public/downloads/` Vercel'de çalışmaz.
- Ürün fotoğrafları `product_images` tablosunda `bytea` olarak saklanır, `/api/product-images/[id]` ile 1 yıl
  immutable önbellekle sunulur; `sniffImage()` ile içerik türü doğrulanır.
- Katalog JSON içe/dışa aktarımı: `src/lib/catalog-import.ts` (SKU ile upsert, alternatif alan adları ve
  `"currency": "usd"` desteği). Ürün form doğrulaması: `src/lib/product-input.ts`.
- Vercel istek gövdesi sınırı 4,5 MB → tüm yüklemeler **4 MB** ile sınırlı.

### Sunucu / istemci yapısı
- Sayfalar Server Component; veritabanına doğrudan Drizzle ile erişir. Kök `layout.tsx` `force-dynamic`
  (oturuma bağlı başlık), dolayısıyla statik prerender beklenmez.
- Etkileşimli parçalar `src/components/**` altında `"use client"` bileşenleri ve `/api/**` route'larına `fetch` eder.
- Sepet istemci tarafında `CartProvider` + `localStorage`; sunucuya yalnızca `{ productId, cases }[]` gider.
- DB bağlantı havuzu `src/db/index.ts`: serverless için küçük (`DATABASE_POOL_MAX`, varsayılan 5), Neon'da
  **pooled** (`-pooler`) bağlantı dizesi + `sslmode=require`. Stripe/pg kullanan route'lar `runtime = "nodejs"`.
- Güvenlik başlıkları `next.config.ts`'te tanımlı. E-posta şablonlarına giren her kullanıcı/ürün metni
  `escapeHtml()` ile, JSON-LD `jsonLdHtml()` ile kaçırılmalı.
- Politika sayfaları `src/app/legal/*` (`LegalPage`): kod kuralları (vergi, teslimat, ödeme, iade) değişirse metni de
  güncelleyin.
- `@/*` → `src/*` yol takma adı.
