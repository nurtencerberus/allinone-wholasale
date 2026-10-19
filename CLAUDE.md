# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

**Meridian Supply Co.** — ABD pazarına yönelik B2B toptan satış mağazası (takviyeler, kiler ürünleri, ev eşyası).
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

Şema değişikliği uygulama (üç bayrak da gerekli — `drizzle.config.json` sabit localhost URL'si içerir):

```bash
npx drizzle-kit push --dialect=postgresql --schema=./src/db/schema.ts --url="$DATABASE_URL"
```

`src/db/schema.ts` değiştiğinde **`db/schema.sql`'i de güncelleyin**: Neon'da yeni kurulumlar bu dosyayla yapılır ve
Drizzle şemasıyla sütun/indeks/FK düzeyinde birebir aynı olması beklenir.

**Test paketi yok.** Doğrulama = `typecheck` + `lint` + `build` + gerçek PostgreSQL'e karşı elle uçtan uca deneme.
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
- **Uydurma içerik:** Ana sayfa istatistikleri, sertifika şeridi, yorumlar, JSON-LD'deki örnek kargo/iade bilgisi
  canlı modda gizlenir. Yeni sahte/örnek içerik eklerseniz aynı koşula bağlayın.

### Dış entegrasyonlar — hepsi isteğe bağlı, anahtar yoksa yerleşik yedek
| Entegrasyon | Dosya | Yedek |
|---|---|---|
| Stripe (Elements + PaymentIntent) | `api/checkout/payment-intent`, `api/orders`, `components/checkout/*` | Demo simülasyonu / kapalı |
| TaxJar | `src/lib/tax.ts` | Eyalet oran tablosu (`nexus_table`) |
| EasyPost | `src/lib/shipping.ts` | Boyutsal ağırlık + bölge matrisi; palet → LTL |
| Resend | `src/lib/email.ts` | Konsola log (`provider: "console"`) |

`NEXT_PUBLIC_*` değişkenleri (site URL'si, Stripe publishable key) **derleme zamanında** gömülür.

### Para ve fiyatlandırma
- Tüm para değerleri **sent cinsinden integer** (`casePrice`, `msrpUnit`, toplamlar). Görüntüleme için
  `formatMoney()` (`src/lib/money.ts`). Vergi oranı `rateX1000` = binde (66.25 → %6.625).
- Satış birimi **koli (case)**; `caseSize` koli başına adet, `minCases`, `priceTiers` (koli adedine göre kademeli fiyat).
- **Tek fiyat kaynağı `priceCart()`** (`src/lib/checkout.ts`): stok kontrolü → kademe fiyatı → toptan hesap indirimi
  (en fazla %40, yalnızca `accountTier === "wholesale"`) → kupon → kargo (`quoteShipping`) → vergi (`quoteTax`,
  vergi muafiyeti dahil). `/api/checkout/quote`, `/payment-intent` ve `/api/orders` hepsi bunu sunucuda yeniden
  çağırır; istemciden gelen fiyata asla güvenilmez. Fiyat kuralı değişikliği yalnızca buraya yapılmalı.
- Sabitler (asgari sipariş, ücretsiz kargo eşiği, çıkış ZIP'i/eyaleti, iletişim bilgisi) `src/lib/site.ts` → `SITE`.

### Sipariş oluşturma (`src/app/api/orders/route.ts`)
Ödeme yöntemleri: `card` (Stripe PaymentIntent sunucuda `retrieve` edilip durum ve tutar doğrulanır), `ach`
(`awaiting_payment`), `net30` (yalnızca wholesale hesaplar, PO numarası zorunlu). Stok düşümü ve sipariş yazımı
**tek transaction** içinde koşullu güncelleme (`stock >= cases`) ile yapılır; sipariş numarası rastgele `MSC-xxxxxxx`,
çakışmada yeniden denenir; `payment_ref` benzersiz indeksi aynı ödemenin iki siparişe dönüşmesini engeller.
Bilinen açık: Stripe webhook yok — sipariş tarayıcının ödeme sonrası çağrısına bağlı.

Sipariş sayfası erişimi `canViewOrder()` (`src/lib/order-access.ts`): admin, sahibi, doğrulanmış aynı e-posta veya
`accessToken` (URL `?token=` ya da `mo_<orderNumber>` çerezi). Misafir siparişleri bu token'a dayanır.

### Kimlik doğrulama
`src/lib/auth.ts`: scrypt parola (`src/lib/password.ts`), `meridian_session` httpOnly çerezi; veritabanında yalnızca
token'ın SHA-256 özeti saklanır. Middleware/proxy **yok** — her sayfa/route kendi kontrolünü yapar:
`getSessionUser()` veya `requireAdmin()` (null ise 401/redirect). Yeni admin route'u eklerken bu kontrolü unutmayın.
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
- Tedarikçi fiyat listeleri: `src/lib/wholesale-lists.ts`; dosyalar veritabanında saklanır, `audience: "trade"`
  olanlar `canAccessTrade()` ister. `public/downloads/` Vercel'de çalışmaz.
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
  `escapeHtml()` ile kaçırılmalı.
- `@/*` → `src/*` yol takma adı.
