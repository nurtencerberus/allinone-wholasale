# İnceleme ve Değişiklikler (Meridian Supply Co.)

Bu belge, projenin uzman gözüyle (e-ticaret, full-stack, güvenlik, performans, UI/UX, hata ayıklama,
dağıtım, bağımlılık analizi) incelenmesi sonucunda **yapılan düzeltmeleri**, **doğrulama sonuçlarını** ve
**canlıya çıkmadan önce kalan işleri** özetler. Önceki ayrıntılı iş planı için bkz. `B2B_ROADMAP.md`.

## 1. Yapılan düzeltmeler

| Alan | Sorun | Düzeltme |
|---|---|---|
| Bağımlılık (kritik) | `next` 16.2.6, kritik güvenlik açığı içeriyordu | `next` 16.4.2'ye yükseltildi |
| Bağımlılık (yüksek) | `xlsx` 0.18.5: prototip kirlenmesi ve ReDoS, npm'de düzeltmesi yok; herkese açık sipariş yükleme ucunda çalışıyordu | `xlsx` kaldırıldı; tüm okuma/yazma `exceljs` ile yapılıyor (`src/lib/spreadsheet.ts`). **Eski `.xls` biçimi artık desteklenmiyor**, kullanıcıya "`.xlsx` veya `.csv` olarak kaydedin" mesajı veriliyor |
| Bağımlılık | `nanoid`, `source-map-js`, `uuid`, `brace-expansion` açıkları | Kapsamlı `overrides` ile güncellendi |
| Üretim bağımlılıkları | — | `npm audit --omit=dev`: **0 açık** |
| Stok | Stoğu aşan sipariş alınıyordu, fazlalık sessizce siliniyordu | Sepet fiyatlamada stok kontrolü; sipariş yazımı ve stok düşümü **tek transaction** içinde, koşullu güncelleme (`stock >= adet`). Eşzamanlı siparişlerde stok asla eksiye düşmez |
| Sipariş numarası | `Date.now()` son 6 hane: çakışınca ödeme alındıktan sonra 500 hatası | Rastgele 7 haneli numara, çakışmada yeniden deneme |
| Çift sipariş | Aynı Stripe ödemesi birden fazla siparişe dönüşebiliyordu | `payment_ref` benzersiz indeks + ön kontrol (409) |
| Giriş / kayıt / şifre sıfırlama | Hız sınırı yoktu (parola deneme saldırısı) | Postgres tabanlı pencere sınırlayıcı (`src/lib/rate-limit.ts`): giriş (IP ve hesap başına), kayıt, şifre sıfırlama, ödeme niyeti, toptan başvuru, dosya yükleme, sipariş |
| Oturum | Oturum anahtarları veritabanında düz metin | Yalnızca SHA-256 özeti saklanır |
| Demo hesapları | `SEED_DEMO_DATA` boşken demo açıktı; bir Vercel dağıtımında demo hesapları çıkabilirdi | Boşken demo **yalnızca üretim dışında** açık. Canlıda `SEED_DEMO_DATA=false` |
| E-posta | Müşteri/ürün metinleri HTML'e kaçırılmadan yazılıyordu (HTML enjeksiyonu) | Tüm ad, şirket, sipariş ve kargo alanları kaçırılıyor (`escapeHtml`) |
| CSV dışa aktarma | Hücre formül enjeksiyonu | `=`, `+`, `-`, `@` ile başlayan metin hücreleri önek alıyor |
| Ödeme ekranı | `useEffect` içinde `setState` (lint hatası, gereksiz render) | Yöntem türetilmiş değer olarak hesaplanıyor |
| HTTP başlıkları | Güvenlik başlığı yoktu | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `X-Powered-By` kapalı |
| Şema | `db/schema.sql` yeni tabloları içermiyordu | Drizzle'dan yeniden üretildi (`rate_limits`, `orders_payment_ref_unique`) |

## 2. Doğrulama

- `tsc --noEmit`: temiz. `eslint .`: 0 hata (1 uyarı: App Router'da `layout.tsx` içindeki font bağlantısı, zararsız).
- `next build`: başarılı.
- Gerçek PostgreSQL üzerinde uçtan uca testler (demo modu):
  - Sepet stok aşımını reddediyor; 5 eşzamanlı siparişte 2 kabul, 3 red, stok 0'da kaldı.
  - Sipariş numaraları benzersiz; misafir token'sız sipariş sayfasını göremiyor (404).
  - Giriş: 10 hatalı denemeden sonra 429.
  - Oturum anahtarı 64 karakterlik özet olarak saklanıyor; çıkış sonrası oturum geçersiz.
  - Tedarikçi dosyası: şablon indirme → adet girme → yükleme doğru satır/adet okuyor. Bozuk dosya ve `.xls` 422 ile temiz şekilde reddediliyor.
  - Liste dönüşümleri (xlsx→csv, csv→xlsx, orijinal indirme) çalışıyor.
- Canlı mod (`SEED_DEMO_DATA=false`, boş veritabanı): demo parolaları sayfada yok, demo hesabı veya örnek sipariş oluşmuyor, şifre sıfırlama ve kayıt yanıtlarında bağlantı dönmüyor.
- Tüm ana sayfalar (`/`, `/shop`, `/wholesale`, `/login`, `/signup`, `/quick-order`, `/checkout`, `/sitemap.xml`, `/robots.txt`, `/api/health`) 200.

## 3. Dağıtım (Vercel + Neon) — henüz yapılmadı

Bu çalışma ortamından Vercel ve Neon API'lerine erişim yok ve hesap anahtarları tanımlı değil. Aşağıdaki adımlar hazır:

1. **Neon:** Yeni proje oluşturun (bölge: `us-east-1`, Vercel `iad1` ile aynı). Bağlantı dizesini **pooled** (host'unda `-pooler` geçen) ve `sslmode=require` ile alın. Boş veritabanında `db/schema.sql` dosyasını SQL Editor'de çalıştırın.
2. **Vercel:** Projeyi bir GitHub deposuna itip Vercel'de içe aktarın (veya Vercel CLI ile). Ortam değişkenleri:
   - `DATABASE_URL` = Neon bağlantı dizesi
   - `SEED_DEMO_DATA` = `false`
   - `NEXT_PUBLIC_SITE_URL` = `https://<alan adınız>`
   - `RESEND_API_KEY` ve `RESEND_FROM` (**zorunlu**: doğrulama ve şifre sıfırlama e-postaları olmadan yeni müşteri hesabını doğrulayamaz, sipariş veremez)
   - `STRIPE_SECRET_KEY` ve `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (kartla ödeme için; `NEXT_PUBLIC_*` derleme zamanında gömülür)
3. **Yönetici hesabı:** Canlı modda hazır yönetici yoktur. Önce siteden kayıt olun, sonra Neon'da `update users set role='admin', email_verified=true where email='<e-posta>';` çalıştırın.
4. **Katalog:** Canlı mod boş başlar. `/admin/products` veya `/admin/catalog` üzerinden tedarikçi dosyanızla ürünleri yükleyin.

## 4. Canlıya çıkmadan önce kalan işler (kod dışı veya büyük kalemler)

| Öncelik | İş | Neden |
|---|---|---|
| **Kritik** | Stripe webhook'u (`payment_intent.succeeded`) ile siparişi sunucuda oluşturma | Müşteri ödemeden sonra sekmeyi kapatırsa tahsilat var, sipariş yok. Şu an sipariş tarayıcı çağrısına bağlı |
| **Kritik** | Eyalet bazlı vergi muafiyeti ve sertifika süresi | Muafiyet şu an eyalete bakmıyor (ME muaf → TX'te de vergi yok) |
| **Kritik** | Yasal sayfalar (şartlar, gizlilik, iade, kargo), FDA/Prop 65 metinleri | Hukuki ve ödeme sağlayıcı incelemesi için zorunlu |
| Yüksek | Sitedeki iddiaların gerçeğe uygunluğu (istatistikler, sertifika rozetleri, yorumlar) | Canlı modda gizleniyor, ama metinlerin işletmeye uygunluğu sizin onayınızı bekliyor |
| Karar | Minimum sipariş tutarı ($150) zorunlu mu, yalnızca bilgi mi? | Şu an yalnızca mesaj gösteriliyor; kodda uygulanmıyor |
| Yüksek | Kendi kimlik bilgilerinin kaynak koddan kaldırılması | Demo parolaları `README.md` ve `AuthForm.tsx` içinde; depo özel tutulmalı |
| Orta | Ana layout çerez okuduğu için tüm sayfalar dinamik | Önbellekleme kazanımı için oturum kısmını istemci bileşenine taşıyın |
| Orta | `rate_limits` tablosunda süresi dolmuş satırların temizlenmesi | Şu an birikir; küçük, ama bir cron ile silinmeli |
| Geliştirme | Geliştirme araçlarındaki açıklar (`eslint`, `drizzle-kit` bağımlılıkları) | Üretim çalışma zamanında yok; yine de periyodik `npm audit` önerilir |

## 5. Değiştirilen dosyalar (özet)

`package.json`, `package-lock.json`, `next.config.ts`, `.env.example`, `db/schema.sql`,
`src/db/schema.ts`, `src/lib/{auth,demo-mode,checkout,email,order-sheet,wholesale-lists,rate-limit,spreadsheet}.ts`,
`src/app/api/orders/route.ts`, `src/app/api/auth/{login,signup,forgot-password,reset-password}/route.ts`,
`src/app/api/checkout/payment-intent/route.ts`, `src/app/api/wholesale/apply/route.ts`,
`src/app/api/order-sheet/import/route.ts`, `src/app/api/admin/{users/[id],orders/[id]}/route.ts`,
`src/components/checkout/PaymentStep.tsx`.
