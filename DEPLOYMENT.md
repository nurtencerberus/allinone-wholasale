# Canlıya Alma Rehberi — Meridian Supply Co.

Bu proje **Next.js 16 (App Router) + PostgreSQL (Drizzle ORM)** ile hazırlandı.
Aşağıda Vercel ve VPS olmak üzere iki dağıtım yolu, ortam değişkenleri ve canlıya
almadan önce uygulanması gereken kontrol listesi yer alıyor.

---

## 0. ciputracorp.com — GoDaddy alan adı ve hosting ile yayına alma

> Son kontrol: GoDaddy'nin kendi SSS sayfası ve basın haberleri. Node.js hosting **beta** olarak
> işaretli ve kurallar değişebilir; satın almadan/kurmadan önce güncel hâlini doğrulayın.

### Önce bilmeniz gereken
Bu proje **PostgreSQL** kullanır. GoDaddy'nin yeni Node.js hosting'i (Economy/Deluxe/Ultimate
Web Hosting planlarına dahil, Node.js 22, zip veya GitHub ile yükleme) şu kısıtlarla geliyor:

| Konu | GoDaddy Node.js hosting | Bu projeye etkisi |
| --- | --- | --- |
| Veritabanı | Yalnızca GoDaddy'nin yönetilen **MySQL**'i | Proje PostgreSQL'e yazılı, MySQL'de **çalışmaz** |
| Dışarıya bağlantı | Yalnızca 80/443 portları ve GoDaddy MySQL (basın haberine göre) | Dışarıdaki PostgreSQL (5432) **erişilemez olabilir** |
| E-posta | Giden SMTP yok | Proje Resend'in HTTPS API'sini kullanır, **sorun yok** |
| package.json | `name`, `version`, `main` dolu olmalı; build/start betikleri; `PORT` okunmalı | Bu projede `version` ve `main` **yok** |
| Bağımlılıklar | Build/start için gerekenler `dependencies` içinde olmalı | `typescript`, `tailwindcss`, `@types/*` şu an `devDependencies` içinde |

**Sonuç:** Projeyi GoDaddy Node.js hosting'inde olduğu gibi çalıştıramazsınız. Üç gerçekçi yol var:

### Yol A — Önerilen: uygulama Vercel + Neon'da, alan adı GoDaddy'de kalır
Test edilmiş yığın budur. Alan adınız, DNS'iniz ve e-posta kutunuz (info@ciputracorp.com) GoDaddy'de
kalır; yalnızca siteyi gösteren kayıtları değiştirirsiniz.

1. **Veritabanı:** [neon.tech](https://neon.tech) → proje oluşturun → **pooled** bağlantı adresini kopyalayın
   (host adında `-pooler` geçer). Tabloları bir kez oluşturun:
   ```bash
   npx drizzle-kit push --url "postgresql://KULLANICI:PAROLA@HOST/DB?sslmode=require"
   ```
2. **Vercel:** [vercel.com/new](https://vercel.com/new) → GitHub deposunu seçin → Environment Variables:

   | Değişken | Değer |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled adresi |
   | `NEXT_PUBLIC_SITE_URL` | `https://ciputracorp.com` |
   | `SEED_DEMO_DATA` | `false` (**zorunlu**: demo parolalar ve ekrana basılan bağlantılar kapanır) |
   | `RESEND_API_KEY`, `RESEND_FROM` | bkz. adım 5 |
   | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | canlı Stripe anahtarları (ödeme almadan önce) |

   `NEXT_PUBLIC_*` değerleri **derleme sırasında** koda gömülür; değiştirirseniz yeniden deploy edin.
3. **Vercel → Project → Settings → Domains:** `ciputracorp.com` ve `www.ciputracorp.com` ekleyin.
   Vercel size tam DNS kayıtlarını gösterir; **ekranda yazan değerleri kullanın**.
4. **GoDaddy → My Products → ciputracorp.com → DNS:**
   - `@` için **A** kaydı: Vercel'in gösterdiği IP (genellikle `76.76.21.21`). GoDaddy'nin varsayılan
     "Parked"/yönlendirme A kaydını silin veya düzenleyin.
   - `www` için **CNAME**: Vercel'in gösterdiği değer (genellikle `cname.vercel-dns.com`).
   - **MX ve TXT kayıtlarına dokunmayın.** info@ciputracorp.com e-postanız onlara bağlı.
   - Yayılma dakikalar–birkaç saat sürer. Vercel sertifikayı (HTTPS) otomatik alır.
   - Dikkat: A kaydını Vercel'e çevirmek, GoDaddy hosting'indeki mevcut web sitesini yayından kaldırır.
5. **Sistem e-postaları (doğrulama, şifre sıfırlama, sipariş onayı):** [resend.com](https://resend.com) →
   Domains → `ciputracorp.com` ekleyin → Resend'in verdiği **DKIM/SPF** kayıtlarını GoDaddy DNS'e girin →
   "Verified" olunca `RESEND_FROM="Meridian Supply Co. <info@ciputracorp.com>"` ve `RESEND_API_KEY` ayarlayın.
   Alan adı doğrulanmadan Resend gönderimi reddeder ve müşteriye hiçbir e-posta gitmez.
6. **İlk admin hesabı:** sitede `/signup` ile hesap açın, sonra Neon SQL Editor'de:
   ```sql
   UPDATE users SET role='admin', email_verified=true WHERE email='info@ciputracorp.com';
   ```

### Yol B — GoDaddy Node.js hosting'inde çalıştırmak (ek geliştirme gerekir)
Hosting planınızı kullanmak istiyorsanız önce şunlar gerekir ve **hiçbiri bu depoda henüz yapılmadı**:
1. `package.json`'a `version` ve `main` alanları eklemek.
2. `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`,
   `postcss` paketlerini `dependencies`'e taşımak.
3. **Veritabanı kararı** (asıl engel): (a) 443 portundan erişilebilen bir PostgreSQL (ör. Neon'un HTTPS
   sürücüsü) ve `src/db/index.ts`'in o sürücüye geçirilmesi, ya da (b) şemanın GoDaddy MySQL'e
   taşınması (jsonb, bytea ve serial alanları nedeniyle büyük bir iş).
4. Ortam değişkenlerini GoDaddy panelinde tanımlamak, GitHub deposunu bağlamak, alan adını uygulamanın
   Settings bölümünden bağlamak.

Madde 3'ün (a) seçeneğini GoDaddy ortamında denemeden "çalışır" diyemem.

### Yol C — GoDaddy VPS
Tam kontrol ister ve her şeyi GoDaddy'de tutmak isterseniz VPS alıp aşağıdaki **5. bölümdeki** adımlarla
PostgreSQL'i aynı sunucuya kurabilirsiniz. En esnek, ama sunucu güvenliği, yedekleme ve güncellemeler
sizin sorumluluğunuzda. GoDaddy'nin paylaşımlı hosting planı bu iş için yeterli değildir.

### Canlıya almadan önce (her yol için)
- [ ] `SEED_DEMO_DATA=false` ayarlı (yoksa herkesin bildiği `Admin123!` parolası geçerli kalır).
- [ ] Resend alan adı doğrulandı ve gerçek bir e-postayla şifre sıfırlama denendi.
- [ ] Stripe **canlı** anahtarları ve gerçek bir küçük tutarlı ödeme denemesi.
- [ ] `B2B_ROADMAP.md` Faz 0 maddeleri kapatıldı.

---

## 1. Kod tabanı yapısı

| Klasör / dosya | Görev |
| --- | --- |
| `src/app/**` | Sayfalar (mağaza, ürün, checkout, hesap, admin, quick-order) + API route'ları |
| `src/db/schema.ts` | Drizzle tabloları (users, sessions, products, orders, applications…) |
| `src/lib/**` | Fiyatlama, boyutsal kargo, satış vergisi, scrypt auth, e-posta, XLS/CSV |
| `public/images/**` | Ürün ve kategori görselleri |
| `DEPLOYMENT.md` | Bu dosya |

Yerel komutlar:

```bash
npm install
npx drizzle-kit push --url "postgresql://USER:PASS@HOST:5432/app_db"   # şemayı uygula
npm run dev        # geliştirme
npm run build      # üretim derlemesi
npm run start      # üretim sunucusu
```

> Şema ilk istekte otomatik tohumlanır (`ensureSeeded()`), elle migration üretmeniz gerekmez.

---

## 2. Hızlı yol — Vercel + Neon/Supabase Postgres (önerilen)

### 2.1 Veritabanı
1. [neon.tech](https://neon.tech), [Supabase](https://supabase.com) veya Vercel Postgres'te bir **PostgreSQL** veritabanı açın.
2. **Connection pooling** açık olan bağlantı string'ini kopyalayın (Neon için `...-pooler...` host'lu URL).
   Serverless fonksiyonlarda her örnek kendi havuzunu açar; pooling açık olmazsa
   `too many connections` hatası alırsınız.
3. Şemayı bir kez uygulayın (bilgisayarınızdan):

```bash
npx drizzle-kit push --url "postgresql://user:pass@region.pooler.neon.tech/dbname?sslmode=require"
```

### 2.2 Vercel
1. Projeyi bir Git reposuna gönderin (`git init && git add . && git commit && git push`).
2. [vercel.com/new](https://vercel.com/new) → repoyu **Import** edin.
3. Framework **Next.js** olarak otomatik tanınır. Build komutu `npm run build`, output klasörü varsayılan.
4. **Environment Variables** bölümüne aşağıdaki tablodaki değişkenleri ekleyin.
5. **Deploy** deyin.

### 2.3 Alan adı
1. Vercel → Project → **Domains** → kendi alan adınızı ekleyin (`ciputracorp.com`).
2. DNS sağlayıcınızda Vercel'in istediği `A` / `CNAME` kayıtlarını girin.
3. `NEXT_PUBLIC_SITE_URL` değerini **https://ciputracorp.com** yapın ve **yeniden deploy edin**
   (bu değişken derleme sırasında koda gömülür).

---

## 3. Ortam değişkenleri

| Değişken | Zorunlu | Ne işe yarar | Yoksa ne olur |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Evet** | PostgreSQL bağlantı string'i | Uygulama açılmaz |
| `NEXT_PUBLIC_SITE_URL` | **Evet** | Kanonik URL: sitemap.xml, robots.txt, JSON-LD, OG etiketleri | `https://ciputracorp.com` kullanılır |
| `SEED_DEMO_DATA` | Hayır | `false` yapınca demo hesap/siparişler tohumlanmaz | Demo veriler eklenir |
| `STRIPE_SECRET_KEY` | Önerilir | PaymentIntent oluşturma + ödeme doğrulama | PCI-güvenli demo ödeme akışı |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Önerilir | Stripe Elements iframe'leri | Kart alanı hiç render edilmez |
| `TAXJAR_API_KEY` | Opsiyonel | Eyalet satış vergisi oranı (adres/ZIP bazlı) | Dahili nexus tablosu kullanılır |
| `EASYPOST_API_KEY` | Opsiyonel | UPS/FedEx canlı kargo teklifleri | Dahili boyutsal kargo matrisi |
| `RESEND_API_KEY` | Opsiyonel | Doğrulama / şifre sıfırlama / sipariş e-postaları | Bağlantılar sunucu loguna yazılır |
| `RESEND_FROM` | Opsiyonel | Gönderen adresi | `Meridian Supply Co. <info@ciputracorp.com>` |

**Stripe canlıya geçiş:** Test anahtarları (`sk_test_…`, `pk_test_…`) yerine canlı
anahtarları (`sk_live_…`, `pk_live_…`) girin. Kart verisi sunucunuza hiç gelmez;
Stripe Elements içinde token'lanır, API'nize yalnızca `paymentIntent` id'si ulaşır
(bu yüzden PCI-DSS kapsamı SAQ-A'dır).

---

## 4. Canlıya almadan önce kontrol listesi

- [ ] `NEXT_PUBLIC_SITE_URL` gerçek alan adınıza ayarlandı ve **yeniden deploy** edildi.
- [ ] `DATABASE_URL` canlı veritabanını gösteriyor ve `npx drizzle-kit push` çalıştırıldı.
- [ ] `SEED_DEMO_DATA=false` yapıldı.
- [ ] Stripe canlı anahtarları girildi; `stripe listen` webhook'ı **gerekmez** (doğrulama PaymentIntent üzerinden yapılır).
- [ ] Resend API anahtarı + gönderen adresi eklendi (e-posta doğrulama ve şifre sıfırlama çalışır).
- [ ] İlk admin hesabı oluşturuldu (aşağıda).
- [ ] Demo sipariş/başvurular temizlendi (aşağıda).
- [ ] `/api/health`, `/sitemap.xml`, `/robots.txt` canlı domainde 200 dönüyor.
- [ ] Admin panelindeki **Integration status** kutuları “Live” gösteriyor.

### İlk admin hesabı

Kayıt formundan normal hesap açıp veritabanında rolü yükseltin:

```bash
psql "$DATABASE_URL" -c "UPDATE users SET role='admin', email_verified=true WHERE email='info@ciputracorp.com';"
```

### Demo verileri temizleme (canlı için)

```bash
psql "$DATABASE_URL" <<'SQL'
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM wholesale_applications;
DELETE FROM addresses;
DELETE FROM sessions;
DELETE FROM users WHERE email IN ('admin@meridiansupply.co','buyer@harborhouse.com','customer@example.com');
SQL
```

Katalog, yorumlar ve kuponlar kalsın istiyorsanız `products`, `reviews`, `coupons`
tablolarına dokunmayın. `SEED_DEMO_DATA=false` olduğunda bu kayılar zaten bir daha
oluşturulmaz.

---

## 5. VPS / kendi sunucunuz (Docker kullanmadan)

```bash
# Ubuntu 22.04+ örneği
sudo apt update && sudo apt install -y nodejs npm postgresql nginx
git clone <repo-url> /var/www/meridian && cd /var/www/meridian
npm ci
npm run build

# şemayı uygula
npx drizzle-kit push --url "$DATABASE_URL"

# süreç yöneticisi
sudo npm i -g pm2
DATABASE_URL=... NEXT_PUBLIC_SITE_URL=https://ciputracorp.com SEED_DEMO_DATA=false \
  STRIPE_SECRET_KEY=... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... RESEND_API_KEY=... \
  pm2 start npm --name meridian -- start
pm2 save && pm2 startup
```

Nginx'i 3000 portuna yönlendirin:

```nginx
server {
  listen 80;
  server_name ciputracorp.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;   # XLS/CSV yüklemeleri için
  }
}
```

Ardından `certbot --nginx` ile ücretsiz SSL sertifikası alın.
`NODE_ENV=production` olduğu için oturum çerezleri `secure` işaretli gönderilir — SSL zorunludur.

---

## 6. Yayından sonra doğrulama

```bash
curl https://ciputracorp.com/api/health          # {"ok":true}
curl -I https://ciputracorp.com/sitemap.xml      # 200
curl https://ciputracorp.com/robots.txt          # account/checkout/admin/api disallow
curl -o test.xlsx https://ciputracorp.com/api/order-sheet/download?format=xlsx
curl -X POST -F "file=@test.xlsx" https://ciputracorp.com/api/order-sheet/import
```

Sayfa kaynaklarında ürün detaylarında `application/ld+json` (AggregateRating,
Offer/Price, InStock, ShippingDetails) bloklarını görebilirsiniz.

---

## 7. Sık karşılaşılan sorunlar

| Belirti | Sebep / çözüm |
| --- | --- |
| `DATABASE_URL is required` | Değişken ortama eklenmemiş, deploy sonrası **rebuild** gerekiyor |
| `too many connections` | Pooling'li (Neon `-pooler`) bağlantı string'i kullanın |
| Sitemap'te yanlış domain | `NEXT_PUBLIC_SITE_URL` değiştiyse yeniden deploy edin |
| Stripe Elements görünmüyor | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` eksik — demo paneli gösterilir |
| E-posta gelmiyor | `RESEND_API_KEY` yoksa bağlantılar sunucu loguna düşer; Resend'de gönderen domain doğrulanmış olmalı |
| Vergi her eyalette 0 | Vergi muafiyetli (resale) hesapla giriş yapmışsınızdır veya TaxJar anahtarı yok |
| 504 / yavaş ilk açılış | Serverless cold start; ilk istek şemayı tohumlar, sonrakiler hızlıdır |
| XLS yüklenmiyor | Dosya 8 MB sınırını aşıyor veya `.xls` yerine `.csv`/`.xlsx` ile deneyin |
