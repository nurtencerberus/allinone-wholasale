# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

**Ciputra Corp.** (eski adı Meridian Supply Co.; adlandırma DEV-8'de temizlendi — yalnızca eski oturum/sepet anahtarları geriye dönük okunur) — ABD pazarına yönelik B2B toptan satış mağazası (takviyeler, kiler ürünleri, ev eşyası).
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
npm run db:migrate:status   # dolu veritabanında ne uygulanmış / ne bekliyor (DATABASE_URL gerekir)
npm run db:migrate -- --yes # bekleyen migration'ları sırayla uygular ve schema_migrations'a yazar
# + db/migrations/NNNN_*.sql: mevcut (Neon) veritabanı için artımlı, tekrar çalıştırılabilir SQL (IF NOT EXISTS,
#   FK adları Drizzle'ınkiyle aynı: <tablo>_<sütun>_<hedef>_<sütun>_fk). CI, main şeması + migration'lar ile
#   db/schema.sql'i tests/schema-signature.sql ile karşılaştırır.
```

Testler:

```bash
npm test                                   # Vitest birim testleri (tests/unit): vergi, adres, fiyat, erişim, TOTP, ürün verisi
npx vitest run tests/unit/tax.test.ts      # tek dosya;  -t "<ad>" ile tek test
npm run test:e2e                           # tests/e2e: çalışan sunucuya (BASE) ve test veritabanına (E2E_DATABASE_URL) karşı
npm run test:browser                       # tests/browser: Playwright (Chromium) — aynı sunucu ve veritabanı
npx playwright test tests/browser/cart.spec.ts        # tek dosya;  --ui ile tarayıcıda adım adım
```

E2E paketleri demo seed'e (`SEED_DEMO_DATA=true`) ve sahte Stripe'a (`node tests/e2e/fake-stripe.mjs`, port 12111,
uygulamada `STRIPE_API_BASE=http://127.0.0.1:12111`, `STRIPE_SECRET_KEY=sk_test_fake`,
`STRIPE_WEBHOOK_SECRET=whsec_testsecret`, `CRON_SECRET=testcronsecret`) ihtiyaç duyar; uzak/Neon veritabanına karşı
çalışmayı reddeder. Tam kurulum `.github/workflows/ci.yml`'de (Postgres servisi + `next start`). Paketler:
auth, account, cart, pricelock, payments, faz1 (roller/2FA, ürün verisi, lot/FEFO, sipariş yaşam döngüsü, iade, vergi
kaydı), catalog (sayfalama, tam metin arama, facet'ler, canonical/noindex). Testler stoğu `setStock()` ile lot üzerinden ayarlar — `products.stock`'u tek başına yazmayın.
`GET /api/health` hızlı bir canlılık kontrolüdür.

**Tarayıcı testleri (DEV-1)** `tests/browser/*.spec.ts`, aynı sunucu ve veritabanına karşı Playwright ile: HTTP
paketlerinin göremediği kısımlar — sepet çekmecesi (sunucudan fiyatlanma, odak tuzağı, Escape), üç adımlı ödeme
sihirbazı (adres → navlun/vergi → ACH ile sipariş), giriş ve 2FA ekranı, atlama bağlantısı ve istemci tarafı gezinme.
Her test `tests/browser/fixtures.ts`'teki muhafızla çalışır: sayfada yakalanmamış bir istisna veya hydration uyuşmazlığı
çıkarsa test düşer (sayfa 200 dönse bile). Yerelde bir kez `npx playwright install chromium` gerekir; CI bunu
`npm run test:e2e`'den sonra kendisi yapar. Seçiciler erişilebilir ad üzerinden kurulur — altbilgideki bülten formunun
da bir "Email address" alanı olduğu için giriş formu `authForm(page)` ile `<main>` içine daraltılır.

Demo girişleri (yalnızca demo modunda): `admin@ciputracorp.com / Admin123!`, `buyer@harborhouse.com / Trade123!`,
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
- **Kargo (`src/lib/shipping.ts`):** koli ağırlığı veritabanında **ons** (`products.weight_oz`), arayüz ve içe/dışa
  aktarma pound (`src/lib/weight.ts` → `ozToLbs`/`lbsToOz`). Faturalanan ağırlık **koli başına** `max(gerçek, boyutsal)`
  + paketleme. Ücretsiz kargo tek yerde uygulanır (`applyFreightAllowance`): yalnızca ground parsel, yalnızca
  `SITE.freeFreightMaxZone`'a kadar, palet hariç — eşik veya kapsam değişirse `SITE` ve politika metni birlikte
  güncellenir. `hazmat` ürün varsa hava servisi hiç sunulmaz. Matris fiyatları gerçek taşıyıcı teklifi değildir,
  "estimate" olarak etiketlenir.
- **Vergi:** yalnızca NJ (`NEXUS` in `src/lib/tax.ts`); `products.tax_class` (general/food/supplement/candy) — NJ'de
  food ve supplement muaf, kargo vergili mala oranla vergilenir; muafiyet NJ sertifika no + süre ister.
- **Asgari sipariş $150** ve ürün başı `minCases` zorunlu. Toptan başvuru doğrulanmış hesaba bağlıdır.
- **Net-30 kredi kontrolü (ODE-6):** `users/companies.credit_limit`, `payment_terms_days`, `credit_hold`;
  `orders.due_at`. Vadeli sipariş `checkCredit()` ile reddedilir — hesap hold'da, **vadesi geçmiş** fatura var
  ya da sipariş limiti aşıyorsa (402). Bakiye ayrı bir defterden değil, açık faturalı siparişlerden sayılır
  (`src/lib/credit.ts`); firma hesabında tüm üyelerin faturaları tek bakiyedir. **Varsayılan limit 0 = vadeli satış
  yok**; limiti ticaret masası `/admin/accounts/[id]/prices` sayfasından verir. Yaşlandırma raporu
  `/admin/reports/ar` (+ CSV), gecelik cron vadesi geçenleri operasyona bildirir.
- **İade:** teslimden itibaren 14 gün (`RETURN_WINDOW_DAYS`); açılmış/hasarlı mal ve **tüm** gıda/takviye iadeleri
  satışa dönmez (karantina veya imha) — `/legal/returns` ile aynı kural `receiveReturn()`'de zorunlu.

### Dış entegrasyonlar — hepsi isteğe bağlı, anahtar yoksa yerleşik yedek
| Entegrasyon | Dosya | Yedek |
|---|---|---|
| Stripe (Elements + manuel capture) | `src/lib/card-checkout.ts`, `api/checkout/payment-intent`, `api/orders`, `api/stripe/webhook` | Demo simülasyonu / kapalı |
| EasyPost | `src/lib/shipping.ts` | Boyutsal ağırlık + bölge matrisi (tahmin olarak etiketlenir); palet → LTL |
| Resend | `src/lib/email.ts` | Konsola log (`provider: "console"`) |

`NEXT_PUBLIC_*` değişkenleri (site URL'si, Stripe publishable key) **derleme zamanında** gömülür.

### Para ve fiyatlandırma
- Tüm para değerleri **sent cinsinden integer** (`casePrice`, `msrpUnit`, toplamlar). Görüntüleme için
  `formatMoney()` (`src/lib/money.ts`). Vergi oranı `rateX1000` = binde (66.25 → %6.625).
- Satış birimi **koli (case)**; `caseSize` koli başına adet, `minCases`, `priceTiers` (koli adedine göre kademeli fiyat).
- **Sepet görünümü:** tarayıcı yalnızca `{productId, cases}` saklar; çekmece/özet verisi `/api/cart` →
  `cartView()` (`src/lib/cart-view.ts`) ile sunucudan gelir ve fiyatlar yine `priceCart()`'tan çıkar. İstemciye
  fiyat yazmayın; kilitli izleyiciye `casePrice: null` döner.
- **Kuponlar:** `couponProblem()` (`src/lib/checkout.ts`) tek kural noktasıdır — tarih penceresi, toplam ve
  müşteri başı kullanım limiti, `allowed_tiers`, `stackable` (sözleşme indirimiyle birleşmez) ve asgari tutar.
  Kullanım siparişle **aynı transaction'da** sayılır (`coupons` satırı `FOR UPDATE`, `coupon_redemptions` kaydı);
  kargo kuponu yalnızca `option.ground` servisini sıfırlar. Admin ekranı `/admin/coupons` (`accounts` izni).
- **Sözleşmeli fiyat (UX-7):** `account_prices` (hesap + ürün) anlaşılmış koli fiyatını tutar.
  `contractPricesFor()` (`src/lib/account-pricing.ts`) ile okunur ve **katalog/kademe fiyatının yerine geçer**;
  hesabın yüzde indirimi bunun **üstüne uygulanmaz** (aksi halde çifte indirim olur). İsteğe bağlı `min_cases`
  ve tarih penceresi vardır; dışındaysa normal fiyatlandırmaya düşer. `PricedLine.priceSource` =
  catalog | tier | contract. Vitrinde BuyBox ve hızlı sipariş aynı kuralı uygular ama **gösterim amaçlıdır** —
  bağlayıcı olan `priceCart()`. Fiyat kullanıcıya özel olduğu için katalog önbelleğine girmez.
- **Firma hesabı (UX-7):** `companies` + `users.company_id/company_role` (owner | buyer | viewer),
  davetler `company_invites` (yalnızca jeton özeti saklanır, 14 gün, tek e-postaya bağlı).
  Ticari koşullar (tier, indirim, muafiyet) firmada **asıl**, `syncCompanyTerms()` ile üye kullanıcı
  satırlarına kopyalanır — fiyatlama, oturum ve admin ekranları eskisi gibi tek alanı okumaya devam eder.
  Firma kapsamı: `account_prices.company_id` (kişiye özel fiyat firmanınkini ezer), `quote_requests.company_id`,
  `orders.company_id` → `canViewOrder()` meslektaşı da kabul eder. Yeni bir "firma verisi" eklerken bu üç
  sütunu ve `companyScope()`'u hatırlayın; aksi halde bir firmanın verisi diğerine görünebilir.
- **RFQ (UX-7):** `quote_requests` + `quote_items` (`src/lib/quotes.ts`; istemciye giden tip ve sabitler
  `src/lib/quotes-view.ts` — sunucu modülünü istemci bileşenine import etmeyin). Durum makinesi
  `QUOTE_TRANSITIONS`: requested → quoted → accepted/declined; karar verilmiş teklif yeniden açılmaz.
  Teklif fiyat içerdiği için **yalnızca `canSeePrices` hesaplar** isteyebilir; hesap başına tek açık talep.
  Kabul, satırları `account_prices`'a yazar (teklif edilen adet `min_cases`, teklifin süresi `expires_at`),
  yani sonraki siparişler kendiliğinden o fiyattan geçer. Süresi geçen teklifleri cron `expireQuotes()` kapatır.
- **Tek fiyat kaynağı `priceCart()`** (`src/lib/checkout.ts`): kademe fiyatı → toptan hesap indirimi (en fazla %40) →
  kupon (satırlara `allocateDiscount` ile dağıtılır) → adres kontrolü → kargo (`quoteShipping`) → vergi (`quoteTax`).
  Sorunları sessizce düzeltmez, **`blockers`** listesi döner (asgari koli/tutar, stok, >999 koli, teslimat bölgesi,
  bulunamayan kargo seçeneği); pasif ürünler `removedProductIds` + mesajla çıkarılır. `/api/checkout/quote` engelleri
  gösterir; `/payment-intent` ve `/api/orders` engel varken reddeder. İstemciden gelen fiyata asla güvenilmez; fiyat
  kuralı değişikliği yalnızca buraya yapılmalı.
- Sabitler (asgari sipariş, ücretsiz kargo eşiği, çıkış ZIP'i/eyaleti, iletişim bilgisi) `src/lib/site.ts` → `SITE`.

### Stok: lotlar ve defter (`src/lib/inventory.ts`)
- Her koli bir lotta (`product_lots`: lot no, `expires_on`, `qty_on_hand`, `qty_quarantine`, durum
  available/hold/expired/recalled). `products.stock` = durumu "available" lotların `qty_on_hand` toplamı; yalnızca
  **fark** olarak ve lot değişikliğiyle aynı transaction'da değişir. Her lot değişikliği `inventory_movements`'a yazılır.
- Stok değiştirmenin tek yolu bu modüldeki fonksiyonlar: `receiveLot`, `adjustLot`, `setLotStatus`, `setLotExpiry`,
  `allocateFefo`, `returnToLot`. Ürün formu/içe aktarma stoğa dokunmaz (yeni üründe açılış lotu hariç).
- Sipariş FEFO ile en erken SKT'li lottan alır ve `order_item_lots`'a yazar; SKT'ye `EXPIRY_PULL_DAYS` (60) gün kalan
  lot satılmaz ve cron'da "expired" yapılır. Gıda/takviye lotunda best-by zorunlu. Cron `stockDrift()` ile
  `products.stock` ↔ lot uyumunu raporlar.

### Sipariş oluşturma ve yaşam döngüsü
- `createOrderRecord()` (`src/lib/orders.ts`): sipariş + kalemler + FEFO lot tahsisi **tek transaction**'da (ürün
  satırları id sırasıyla kilitlenir); satıra kupon payı, vergi sınıfı, matrah ve vergi (`allocateTax`) yazılır;
  `order_events`'e "created". Rastgele `MSC-xxxxxxx` (çakışmada yeniden dener). `cancelOrderAndRestock()` iptal +
  kolilerin geldikleri lotlara iadesi (para işlemi yapmaz).
- `src/lib/order-admin.ts`: `ORDER_TRANSITIONS` (processing → picking → shipped → delivered; iptal yalnızca
  processing/picking), sevk için ödeme kapanmış (`SHIPPABLE_PAYMENT`) ve takip/PRO no şart; `cancelOrder()` kartı
  Stripe'tan iade eder (idempotent), açık faturayı `void` yapar, banka ödemesini `refund_due` işaretler; RMA:
  `requestReturn` → `decideReturn` → `receiveReturn` → `refundReturn` (satır net fiyatı + vergisi, yuvarlama kaymasız).
  Admin işlemleri `/api/admin/orders/[id]` ve `/api/admin/returns/[id]`'de tek `action` alanıyla.
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
`src/lib/auth.ts`: scrypt parola (`src/lib/password.ts`), `ciputra_session` httpOnly çerezi; veritabanında yalnızca
token'ın SHA-256 özeti saklanır. Middleware/proxy **yok** — her sayfa/route kendi kontrolünü yapar:
`getSessionUser()`; personel için API'de `requireStaff(permission)` (null → `staffDenied()`), sayfada
`requireStaffPage(permission, path)`. Roller ve izinler `src/lib/staff.ts`'te (admin = sahip, ops, sales, accounting,
viewer; izinler view/products/inventory/orders/payments/accounts/lists/reports/staff). Yeni admin route'u eklerken
doğru izni seçin ve değişikliği `recordAudit()` (`src/lib/audit.ts`) ile kaydedin — işlem transaction'daysa `tx` ile.
- **2FA:** personel canlı modda TOTP olmadan admin'e giremez (`staffTwoFactorRequired()`, `STAFF_2FA`). Giriş parolayı
  doğrulayınca `login_challenges` + `ciputra_2fa` çerezi oluşturur, oturum `/api/auth/two-factor`'da kod/kurtarma
  koduyla açılır (`src/lib/two-factor.ts`, `src/lib/totp.ts`). Kod adımı tekrar kullanılamaz (`totp_last_step`).
Sıfırlama/doğrulama jetonları da yalnızca `digestToken()` özeti olarak saklanır ve tek `UPDATE … RETURNING` ile tüketilir.
E-posta linkleri `appOrigin()`'den (`src/lib/site.ts`) üretilir, istek Host'undan değil. `?next=` → `safeNextPath()`.
E-posta doğrulanmamış kullanıcı sipariş veremez. Canlıda ilk admin SQL ile atanır (DEPLOYMENT.md §3.3).

### Hata kaydı ve alarm (DEV-3)
`src/lib/alerts.ts` → `alertOps({ key, subject, message, context })`: olayı **tek satır JSON** olarak loglar
(Vercel log aramasında ve drain'de filtrelenebilir) ve aynı `key` için 15 dakikada bir kez operasyona e-posta atar
(`rate_limits` üzerinden, örnekler arası paylaşımlı). Para yollarında kullanılır: Stripe webhook hatası, kart
capture/sipariş yazma hatası, `/api/orders` beklenmedik 500'ü, gecelik cron'un düşmesi. `src/instrumentation.ts`
→ `onRequestError` yakalanmayan her hatayı aynı biçimde loglar ve ödeme/sipariş yollarındaysa alarma çevirir.
`GET /api/health` veritabanına erişemezse **503** döner (uptime izleme buna bakmalı).

### Sürümler ve adlandırma (DEV-6/8)
- `engines.node: "24.x"` — Vercel projesi de 24.x; CI de 24 kullanır. Yerelde daha yeni bir Node varsa
  `npm install` bir `EBADENGINE` uyarısı basar, zararsızdır.
- `eslint-config-next` **`next` ile aynı sürümde** tutulur; ayrıldıklarında lint ya sessizce zayıflar ya da
  projede olmayan kuralları uygular. TypeScript 7, ESLint 10 ve Vitest 5 (major) bilinçli olarak ertelendi.
- Çerez ve depolama anahtarları `ciputra_*`; eski `meridian_session` ve `meridian_cart_*` anahtarları yalnızca
  **geriye dönük okunur** (kimse çıkış yapmak zorunda kalmasın diye). Eski çerezler dolunca (30 gün) silinebilir.

### Hesap güvenliği (KYT)
- **CSRF (`src/proxy.ts`):** `/api/**` üzerindeki POST/PUT/PATCH/DELETE istekleri **kendi origin'imizden** ve
  gerçek bir API content-type'ı ile gelmek zorunda; `text/plain` reddedilir (415), yabancı origin 403.
  Stripe webhook'u muaftır (imzasıyla doğrulanır). Bu dosya **yetkilendirme yapmaz** — her route kendi
  `requireStaff`/`getSessionUser` kontrolünü yapmaya devam eder.
- **Hesap sızıntısı yok (KYT-8):** kayıt, adres kayıtlı olsa da olmasa da **aynı yanıtı** döner ve oturum
  açmaz; adres kayıtlıysa yalnızca gerçek sahibine "biri hesap açmaya çalıştı" e-postası gider. Doğrulama
  linkine tıklayınca müşteri oturumu açılır (personel yine parola + TOTP ile girer).
- **Parola (KYT-10):** `passwordProblem()` — en az 10 karakter, 256 sınırı, leet çözümlü yaygın parola ve
  klavye dizisi kontrolü, e-postadan türetilmiş parola reddi. scrypt artık **async** (event loop'u kilitlemez).
  Parola değişimi diğer tüm oturumları kapatır; `/account/security`'de "her yerden çık" da var.
- **Oturum süresi:** müşteri 30 gün, **personel 8 saat** (admin konsolu anahtarı).

- **Başvuru belgeleri (KYT-11):** `application_documents` — başvuru sahibi hesap sayfasından resale
  certificate / W-9 / lisans yükler (PDF veya fotoğraf, içerik **bayttan** doğrulanır, 4 MB, başvuru başına 6).
  Personel `/api/admin/applications/[id]/documents/[docId]` ile açar; **her açılış audit log'a yazılır**
  (belgede vergi numarası var). EIN tek biçimde saklanır (`12-3456789`) ve başvuru ekranında aynı EIN'in
  başka hesap/başvuruda görünmesi **uyarı** olarak çıkar — reddetme değil, çünkü aynı işletmeden ikinci alıcı
  normaldir (doğru çözüm onu mevcut firma hesabına eklemektir).

### Hız sınırlama
`src/lib/rate-limit.ts` → `consumeRateLimit(scope, key, limit, windowSeconds)`; Postgres `rate_limits` tablosunda
sabit pencere (serverless örnekler arasında paylaşılır, in-memory kullanmayın). `clientIp()` + `tooManyRequests()`
ile birlikte giriş, kayıt, şifre sıfırlama, sipariş, ödeme niyeti, başvuru ve yüklemelerde kullanılır.

### Dosyalar ve tablolar (Excel/CSV)
- Yalnızca **`exceljs`** kullanılır (`src/lib/spreadsheet.ts`); `xlsx` paketi güvenlik nedeniyle kaldırıldı, tekrar
  eklemeyin. Eski `.xls` (BIFF) okunamaz — 422 ile "`.xlsx` veya `.csv` kaydedin" mesajı verilir.
- CSV dışa aktarımında `= + - @` ile başlayan hücreler formül enjeksiyonuna karşı öneklenir.
- Hızlı sipariş formu: `src/lib/order-sheet.ts` (`ORDER_COLUMNS` hem üretim hem ayrıştırma için ortak şema);
  `/api/quick-order` SKU'nun yanında UPC/ITF-14 barkodunu da eşleştirir.
- Tedarikçi fiyat listeleri: `src/lib/wholesale-lists.ts`; dosyalar veritabanında saklanır. Fiyat içerdikleri için
  `audience` değerinden bağımsız **hepsi** `canSeePrices` ister. `public/downloads/` Vercel'de çalışmaz.
- Ürün fotoğrafları `product_images` tablosunda `bytea` olarak saklanır, `/api/product-images/[id]` ile 1 yıl
  immutable önbellekle sunulur; `sniffImage()` ile içerik türü doğrulanır.
- Katalog JSON içe/dışa aktarımı: `src/lib/catalog-import.ts` alan adlarını eşler; `/api/admin/catalog` her satırı
  `validateProductInput()` ile doğrular, hep-ya-hiç tek transaction'da yazar, mevcut ürünün slug ve stoğuna dokunmaz.
  Ürün doğrulaması `src/lib/product-input.ts`; GTIN/ASIN/alerjen/menşe yardımcıları `src/lib/product-data.ts`.
- Ürün düzenleme iyimser kilitlidir: form `updatedAt`'i geri gönderir, arada kaydedilmişse 409.
- Maliyet (`cost_price`) ve tedarikçi alanları yalnızca personele: `BuyBox` gibi istemci bileşenlerine dar tip
  (`BuyBoxProduct`, `CardProduct`) geçin.
- Vercel istek gövdesi sınırı 4,5 MB → tüm yüklemeler **4 MB** ile sınırlı.

### Sunucu / istemci yapısı
- **Katalog ızgarası (UX-6):** mağaza sayfası **sayfa sayfa** gelir (`SHOP_PAGE_SIZE = 24`, `shopList(filters, q, page)`
  → `{ rows, total, page, pages }`); sayfa numarası aralığa sıkıştırılır, filtre değişince 1'e döner. Arama Postgres
  **tam metin** aramasıdır (`to_tsvector('english', name + brand + sku + description)`, `websearch_to_tsquery`,
  `ts_rank` ile sıralama) ve bu ifade `products_search_idx` GIN indeksiyle **birebir** aynı olmalıdır — değiştirirseniz
  indeksi (schema.ts + migration) birlikte değiştirin, yoksa her arama tabloyu tarar. SKU/GTIN/ASIN/MPN için
  `ilike` araması korunur (kısmi kod arayan alıcı İngilizce yazmıyor), tam kod eşleşmesi doğrudan ürüne yönlendirir.
  Facet'ler: departman, marka (`cachedBrands`), fiyat bandı, stok, sertifika (`certifications` içinde belgesi olan).
- **Yükleme ve hata sınırları (UX-4):** `error.tsx` + `global-error.tsx` var, **`loading.tsx` bilinçli olarak yok.**
  Route seviyesindeki `loading.tsx` tüm sayfayı Suspense'e alır; kabuk 200 ile akmaya başladığı için `notFound()` ve
  `redirect()` artık durum kodunu değiştiremez (bilinmeyen ürün yumuşak 404, SKU aramasının 307'si 200 olur — bu
  gerçekten oldu ve e2e yakaladı). Bunun yerine **sayfa içinde** `<Suspense>` kullanılır: yönlendirme/404 kararı
  verildikten sonra yalnızca yavaş kısım askıya alınır (`src/app/shop/page.tsx` → `CatalogBody` + `CatalogSkeleton`).
  Yeni bir route'a `loading.tsx` eklemeden önce o sayfanın `redirect()`/`notFound()` çağırmadığından emin olun.
- **Katalog önbelleği (PRF-1):** vitrin sorguları `src/lib/catalog-cache.ts` üzerinden Next data cache'inde
  (`cachedFeatured`, `cachedActiveCatalog`, `cachedCategoryCounts`, `shopList`, `cachedProductBySlug`,
  `cachedRelated`; 60 sn TTL + `catalog` etiketi). **Önbellekte yalnızca ürün satırları vardır, render edilmiş
  HTML değil** — fiyat kilidi izleyiciye göre değiştiği için paylaşımlı HTML önbelleği fiyat sızdırırdı. Ürün,
  katalog içe aktarma, stok ve sipariş yazan her yol `revalidateCatalog()` çağırır; yeni bir yazma yolu eklerseniz
  siz de çağırın. Serbest metin aramaları önbelleğe alınmaz (ziyaretçi girdisi anahtar şişirir).
- Sayfalar Server Component; veritabanına doğrudan Drizzle ile erişir. Kök `layout.tsx` `force-dynamic`
  (oturuma bağlı başlık), dolayısıyla statik prerender beklenmez.
- Etkileşimli parçalar `src/components/**` altında `"use client"` bileşenleri ve `/api/**` route'larına `fetch` eder.
- Sepet istemci tarafında `CartProvider` + `localStorage`; sunucuya yalnızca `{ productId, cases }[]` gider.
  Girişli kullanıcıda sepet ayrıca sunucuda tutulur (`carts`/`cart_items`, `src/lib/cart-store.ts`): açılışta
  `PATCH /api/cart` yerel sepeti kayıtlıyla **birleştirir** (satır başına büyük adet alınır, toplanmaz), her
  değişiklikte `PUT /api/cart` kaydeder, sipariş oluşunca `clearCart()` boşaltır. Cron 3 gün dokunulmamış sepet
  için **tek** hatırlatma e-postası atar (`reminded_at`; sepet değişince sıfırlanır).
- DB bağlantı havuzu `src/db/index.ts`: serverless için küçük (`DATABASE_POOL_MAX`, varsayılan 5), Neon'da
  **pooled** (`-pooler`) bağlantı dizesi. Stripe/pg kullanan route'lar `runtime = "nodejs"`. Üç ayrıntı canlı
  log'lardan geldi, değiştirmeden önce okuyun:
  - **TLS kodda ayarlanır.** `DATABASE_URL`'deki `sslmode` (ve libpq'ya özel `channel_binding`) `poolConfigFor()`
    ile dizeden çıkarılıp `ssl: { rejectUnauthorized: true }`'ye çevrilir. Çünkü pg 8.23 `sslmode=require` görünce
    her bağlantıda stderr'e uyarı basıyor ve Vercel bunu `level:error` olarak kaydedip gerçek hataları gömüyor;
    ayrıca pg 9'da `require` anlamı zayıflayacak. Davranış bugünküyle aynı, uyarı yok.
  - **`keepAlive` + `pool.on("error")`.** Neon boşta kalan compute'u askıya alır, pooler sessiz socket'i düşürür.
    Havuzun `error` olayını dinlemezseniz Node bunu yakalanmamış hata sayar ve fonksiyon çağrısını düşürür.
  - **Tek SELECT için bir kez yeniden deneme.** `Connection terminated unexpectedly` canlıda katalog önbelleği
    yenilenirken görüldü. Yalnızca tek `select`/`with` ifadeleri tekrarlanır; yazmalar ve transaction'lar
    (`pool.connect()` ile ayrı istemci alır) **asla** — çift uygulanabilecek hiçbir şey tekrarlanmaz.
- Güvenlik başlıkları `next.config.ts`'te tanımlı; **CSP** de orada (`default-src 'self'`, Stripe için
  `js.stripe.com` / `*.stripe.network`, görseller için `images.pexels.com`). Script'lerde `'unsafe-inline'` var
  çünkü App Router satır içi bootstrap script'i basıyor ve nonce üretecek middleware yok — yeni bir dış kaynak
  eklerseniz CSP'yi de güncelleyin, yoksa tarayıcı engeller.
- Fontlar `next/font/google` ile **derleme zamanında indirilip kendi origin'imizden** servis edilir
  (`src/app/layout.tsx` → `--font-fraunces` / `--font-manrope`, `globals.css` bunları okur). Google'a istek yok.
- Görseller `next/image` ile servis edilir (`next.config.ts` → AVIF/WebP, `images.pexels.com` izinli). Yeni bir
  uzak görsel kaynağı eklerseniz `remotePatterns` ve CSP `img-src` birlikte güncellenir.
- `getSessionUser()` React `cache()` ile sarılıdır: aynı istek içinde layout, sayfa ve iç bileşenler çağırsa da
  oturum sorgusu bir kez çalışır. E-posta şablonlarına giren her kullanıcı/ürün metni
  `escapeHtml()` ile, JSON-LD `jsonLdHtml()` ile kaçırılmalı.
- **Erişilebilirlik (UX-3, WCAG 2.1 AA):** her form kontrolünün bir adı olmalı (`<label htmlFor>` ya da
  `aria-label`), her `<th>` `scope` taşımalı, her görselde `alt` olmalı, sayfa başına tek `<h1>`. Odak halkası
  `globals.css`'te `:focus-visible` ile global; `prefers-reduced-motion` animasyonları kapatır; `.skip-link`
  içeriğe atlar (`<main id="main-content">`). Metin renkleri: cream üstünde **en az `text-ink/65`**, ink üstünde
  **en az `text-cream/50`** (daha açığı AA'nın 4.5:1 eşiğini geçmez); `tests/unit/contrast.test.ts` paleti ve bu
  tonları doğrular, `tests/e2e/a11y.mjs` sunulan HTML'i. Odak yakalayan her bileşen (sepet çekmecesi) `role="dialog"`
  + `aria-modal` olmalı ve kapanınca odağı geri vermelidir.
- **Canonical ve robots (UX-5):** kök `layout.tsx` artık canonical **tanımlamaz** — miras alındığı için her sayfanın
  "ben ana sayfayım" demesine yol açıyordu. İndekslenen her sayfa kendi canonical'ını verir (`/shop` kategori ve
  sayfa numarasını da içerir), özel sayfalar (`login`, `account`, `admin`, `checkout`, `order`, `invite`,
  parola/doğrulama) `robots: { index: false }` verir; arama sonucu sayfaları (`/shop?q=`) noindex'tir. Yeni sayfa
  eklerken ikisinden birini seçin, yoksa sayfa canonical'sız kalır (yanlış canonical'dan iyidir).
- Politika sayfaları `src/app/legal/*` (`LegalPage`): kod kuralları (vergi, teslimat, ödeme, iade) değişirse metni de
  güncelleyin.
- Vergi kaydı: sipariş `tax_source`, `taxable_amount`, `shipping_taxable/tax`, `exemption_cert`; aylık rapor
  `src/lib/tax-report.ts` → `/admin/reports/tax` (+ CSV `/api/admin/reports/tax`). Prop 65 uyarısı CA teslimatında
  `priceCart().messages` ile ödeme öncesi gösterilir.
- `@/*` → `src/*` yol takma adı.
