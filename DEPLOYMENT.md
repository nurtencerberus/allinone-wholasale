# Canlıya Alma Rehberi — ciputracorp.com

**Yol:** Uygulama **Vercel**'de, veritabanı **Neon**'da (PostgreSQL), alan adı ve e-posta **GoDaddy**'de kalır.

> Vercel ve GoDaddy bilgileri Ekim 2026'da bu şirketlerin kendi sayfalarından kontrol edildi. Fiyatlar,
> kurallar ve arayüz adları değişebilir; emin olmadığınız yerde ilgili sayfadan teyit edin.
> Neon'un ekran adlarını bu rehber için belgesinden doğrulamadım — adlar farklıysa benzer menüyü izleyin.

---

## 1. Hangi parça nerede çalışır

| Parça | Yer | Not |
| --- | --- | --- |
| Site (Next.js) | **Vercel** | GitHub'daki `main` dalından otomatik deploy |
| Veritabanı | **Neon** (PostgreSQL) | Vercel'in varsayılan bölgesiyle aynı: AWS **us-east-1** (N. Virginia) |
| Alan adı, DNS, `info@ciputracorp.com` kutusu | **GoDaddy** | Yalnızca `@` A kaydı ve `www` CNAME değişir |
| Sistem e-postaları (doğrulama, şifre sıfırlama, sipariş onayı) | **Resend** | GoDaddy DNS'e DKIM/SPF kaydı eklenir |
| Kart ödemesi | **Stripe** | Anahtar girilene kadar kart ödemesi **kapalıdır** |

---

## 2. Başlamadan önce bilmeniz gerekenler

1. **Vercel'in ücretsiz Hobby planı yalnızca "ticari olmayan, kişisel kullanım" içindir** (Vercel'in kendi
   Hobby sayfası). Bir B2B mağaza ticari olduğu için **Pro** plan gerekir. O sayfaya göre Pro'da geliştirici
   koltuğu kullanıcı başına ayda 20 USD.
2. **Vercel istek gövdesini 4,5 MB ile sınırlar** (aşılırsa `413 FUNCTION_PAYLOAD_TOO_LARGE`). Bu yüzden ürün
   fotoğrafı, sipariş formu ve tedarikçi fiyat listesi yüklemeleri **4 MB** ile sınırlandı.
3. **`public/downloads/` klasörüne dosya koyma yöntemi Vercel'de çalışmaz** (fonksiyon paketinde dosya sistemi
   yok). Tedarikçi listelerini **`/admin/lists`** sayfasından yükleyin.
4. **Neon'un ücretsiz planı boşta kalan veritabanını uyutabilir** (sık görülen davranış, güncel planı
   neon.com/pricing'den kontrol edin). İlk istek birkaç saniye sürebilir; bağlantı zaman aşımı 15 sn'dir.

### Canlı mod (`SEED_DEMO_DATA=false`) neyi değiştirir

Bunu **mutlaka** ayarlayın. Ayar yoksa site demo modunda açılır: herkesin bildiği `Admin123!` parolası, sahte
yorumlar ve `MERIDIAN10` kuponu canlıya çıkar.

| Konu | Demo mod (varsayılan) | Canlı mod |
| --- | --- | --- |
| Örnek katalog, yorum, kupon, hesap, sipariş | Oluşturulur | **Hiçbiri oluşturulmaz** — mağaza boş başlar, ürünleri siz eklersiniz |
| Giriş sayfasında demo hesaplar | Görünür | Gizli |
| Ana sayfadaki sayılar, sertifika şeridi, müşteri yorumları | Görünür | **Gizli** (uydurma verilerdir) |
| Kartla ödeme, Stripe anahtarı yokken | Test kartı simülasyonu | **Reddedilir**; ACH/havale ve (onaylı hesaplara) Net-30 çalışır |
| Şifre sıfırlama / doğrulama bağlantısı | E-posta gidemezse ekranda gösterilir | **Yalnızca e-postayla** gönderilir |
| Ürün yapısal verisinde örnek kargo ücreti ve "30 gün iade" | Yayınlanır | Yayınlanmaz |

---

## 3. Adım adım

### 3.1 Neon — veritabanı
1. [neon.com](https://neon.com) → hesap → yeni proje. **Region: AWS US East 1 (N. Virginia)**.
2. **SQL Editor**'ü açın. GitHub'daki **`db/schema.sql`** dosyasını açın (Raw), tümünü kopyalayın,
   editöre yapıştırıp **Run** deyin. Bu 11 tabloyu kurar.
   - **Yalnızca boş veritabanında, bir kez** çalıştırın. İkinci çalıştırma `already exists` ile hata verir
     (zararsızdır, veriyi çoğaltmaz).
   - Bu dosyanın, `drizzle-kit push` ile oluşan şemayla sütun, indeks ve yabancı anahtar düzeyinde birebir
     aynı olduğunu boş bir PostgreSQL üzerinde karşılaştırarak doğruladım.
3. **Connect** penceresinden **pooled** bağlantı adresini kopyalayın (host adında `-pooler` geçer). Vercel'e
   bunu vereceksiniz. Adres `postgresql://...` ile başlar ve içinde parolanız vardır; kimseyle paylaşmayın.

### 3.2 Vercel — site
1. [vercel.com](https://vercel.com) → **Pro** plan → **Add New → Project** → GitHub'dan
   `nurtencerberus/allinone-wholasale` deposunu seçin. Depo özel (private) olduğu için Vercel'in GitHub
   uygulamasına bu depoya erişim izni vermeniz gerekir.
2. Framework otomatik **Next.js** olarak gelir. **Environment Variables** (Production):

   | Değişken | Değer |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** adresi |
   | `NEXT_PUBLIC_SITE_URL` | `https://ciputracorp.com` (kanonik adresiniz `www` ise onu yazın) |
   | `SEED_DEMO_DATA` | `false` |
   | `RESEND_API_KEY`, `RESEND_FROM` | bkz. 3.6 |
   | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | bkz. 3.7 |
   | `DATABASE_POOL_MAX` | isteğe bağlı, varsayılan 5 |

3. **Deploy**. Site önce `https://<proje>.vercel.app` adresinde açılır. Derleme için `DATABASE_URL`
   gerekmez; veritabanı yalnızca çalışma anında kullanılır.
4. `NEXT_PUBLIC_*` değerleri **derleme sırasında** koda gömülür. Birini değiştirirseniz **yeniden deploy**
   edin.

### 3.3 İlk admin hesabı
Alan adını bağlamadan **önce**, `*.vercel.app` adresinde yapın:
1. `https://<proje>.vercel.app/signup` → `info@ciputracorp.com` ile **güçlü, benzersiz bir parolayla** kayıt.
2. Neon **SQL Editor**'de:
   ```sql
   UPDATE users SET role='admin', email_verified=true WHERE email='info@ciputracorp.com';
   ```
3. `/login` ile girin. Canlı modda personel hesapları iki adımlı doğrulama (2FA) olmadan admin'e giremez:
   ilk girişte `/account/security` sayfasına yönlendirilirsiniz. Telefonunuzdaki doğrulama uygulamasıyla
   (Google Authenticator, 1Password, Authy…) QR kodu okutun, 6 haneli kodu girin ve gösterilen **10 kurtarma
   kodunu** parola yöneticinize kaydedin. Sonra `/admin` açılır.
4. Diğer çalışanlar önce kendileri kayıt olup e-postalarını doğrular; siz `/admin/users`'tan rol verirsiniz
   (Operasyon, Satış, Muhasebe, Salt okunur, Sahip). Rol değişikliği sizin parolanızı ister, kişiye e-posta gider
   ve `/admin/audit`'e yazılır.

Kayıt sırasında e-posta doğrulanmadığı için bu adımı siteyi duyurmadan ve alan adını bağlamadan yapın: o
e-postayla başkası önce kayıt olursa admin yetkisini ona vermiş olursunuz.

### 3.4 Ürünlerinizi girin
Mağaza boş başlar.
- **`/admin/products` → Add product:** tek tek ürün, fotoğraf yükleme (fotoğraf başına 4 MB). UPC/GTIN kontrol
  hanesiyle doğrulanır; ASIN girilirse Amazon karşılaştırma bağlantısı yalnızca onaylı alıcılara gösterilir.
- **Stok yalnızca lot olarak girilir.** Yeni üründe "Opening stock" + lot no + son kullanma (best-by) tarihi; sonraki
  mal kabuller `/admin/inventory` → *Receive goods*. Gıda ve takviyede best-by zorunludur. Ürün formunda stok
  sayısı düzenlenemez — sayım farkı için lotta *Adjust* (gerekçe + not ister).
- **`/admin/catalog`:** JSON ile toplu içe aktarma. Tek satır hatalıysa hiçbir şey yazılmaz; mevcut ürünlerin stoğu
  ve adresi (slug) değişmez.
- **`/admin/lists`:** tedarikçi .xlsx / .csv fiyat listeleri (4 MB).
- Kupon yönetim ekranı yoktur; kupon gerekiyorsa `coupons` tablosuna SQL ile eklenir.

### 3.5 Alan adı — GoDaddy DNS
1. Vercel → proje → **Settings → Domains** → `ciputracorp.com` ve `www.ciputracorp.com` ekleyin.
   Vercel her alan adı için **tam kaydı ekranda gösterir; oradaki değeri kullanın.**
2. GoDaddy → **My Products → ciputracorp.com → DNS**:
   - `@` için **A** kaydı: Vercel'in gösterdiği IP. Çoğu projede `76.76.21.21`; yeni projelerde farklı bir
     adres (ör. `216.198.79.1`) görünebilir, kart neyi gösteriyorsa onu girin.
   - `www` için **CNAME**: Vercel'in gösterdiği hedef (çoğu projede `cname.vercel-dns.com`).
   - **Eski `@` A kaydını ve GoDaddy'nin "Parked" kaydını silin.** Eski kayıtlar doğrulamayı engeller.
   - **MX ve TXT kayıtlarına dokunmayın**: `info@ciputracorp.com` e-postanız onlara bağlıdır.
3. Vercel'de iki adresten birini kanonik seçip diğerini ona yönlendirin. `NEXT_PUBLIC_SITE_URL` bu
   kanonik adres olmalıdır (sitemap, robots ve Google verisi buna göre üretilir).
4. Vercel kartı **Valid Configuration** gösterdiğinde HTTPS sertifikası otomatik verilir. Yayılma dakikalar
   ile birkaç saat sürebilir.

> **Dikkat:** `@` kaydını Vercel'e çevirmek, alan adının şu an GoDaddy hostingde gösterdiği siteyi yayından
> kaldırır.

### 3.6 E-posta — Resend
Resend olmadan müşteriye **hiçbir e-posta gitmez** (doğrulama, şifre sıfırlama, sipariş onayı).
1. [resend.com](https://resend.com) → **Domains** → `ciputracorp.com` ekleyin.
2. Resend'in gösterdiği DKIM/SPF kayıtlarını GoDaddy DNS'e **aynen** ekleyin. Aynı isimde ikinci bir
   `v=spf1` TXT kaydı eklemeyin (iki SPF kaydı SPF'i bozar); Resend ayrı bir alt alan adı verirse sorun olmaz.
3. **Verified** olunca Vercel'e `RESEND_API_KEY` ve
   `RESEND_FROM="Meridian Supply Co. <info@ciputracorp.com>"` ekleyip yeniden deploy edin.
4. Gerçek bir e-postayla **şifre sıfırlamayı** deneyin.

### 3.7 Kart ödemesi — Stripe
Anahtar girilene kadar canlı sitede **kartla ödeme kapalıdır** ve müşteri ACH/havale seçeneğini görür.
1. Stripe hesabınızı etkinleştirin; **canlı** anahtarları (`sk_live_…`, `pk_live_…`) Vercel'e ekleyin ve
   yeniden deploy edin.
2. Küçük gerçek bir tutarla ödeme deneyin, sonra Stripe panelinden iade edin.
3. **Stripe webhook'u yoktur.** Müşteri ödeme sonrası sekmeyi kapatırsa para alınır ama sipariş oluşmayabilir.
   Webhook eklenene kadar Stripe panelini sipariş listesiyle düzenli karşılaştırın (`B2B_ROADMAP.md`, P0-6).

---

## 4. Yayından sonra doğrulama

```bash
curl https://ciputracorp.com/api/health             # {"ok":true}
curl https://ciputracorp.com/sitemap.xml | head     # adresler ciputracorp.com olmalı
curl https://ciputracorp.com/robots.txt             # Sitemap: https://ciputracorp.com/sitemap.xml
curl -s https://ciputracorp.com/login | grep -c "Admin123"    # 0 olmalı
```
Sonra: bir ürün ekleyin (lotlu açılış stoğuyla), onaylı bir test hesabıyla ACH siparişi verin;
`/admin/orders/<no>` sayfasında *Mark picking* → *Record payment received* → takip no ile *Mark shipped* →
*Mark delivered*; sevk irsaliyesinde lot numarası görünmeli. Ardından alıcı hesabından iade talebi açıp
`/admin/returns`'te onay → teslim alma → iade adımlarını deneyin. `/admin/inventory`'de stok defteri her hareketi
göstermeli; günlük cron raporunda `stockDrift` boş olmalı.

---

## 5. Gerçek müşteri almadan önce açık işler

Faz 0 ve Faz 1'de kapatılanlar ve kalanlar `IS-PLANI.md`'de (§3 durum tabloları). Kod dışı kalanlar:
- Politika sayfalarının ABD'li bir avukatça incelenmesi (`/legal/*`).
- NJ vergi sınıflarının ve aylık rapordaki rakamların (`/admin/reports/tax`) mali müşavirle teyidi.
- Örnek katalogdaki doğrulanmamış iddiaların (NSF, cGMP vb.) belgeli gerçek bilgiyle değiştirilmesi. Sertifika
  rozeti artık yalnızca belge bağlantısı girilirse gösterilir.
- Stripe hesabının etkinleştirilmesi ve webhook (§3.7); Resend alan adı doğrulaması (§3.6).
- Net-30 için kredi limiti, PDF fatura ve tahsilat takibi (Faz 3).

---

## 6. Sizin onaylamanız gereken metinler

Bunlar benim yazdığım yer tutuculardır; işletmenizin gerçek politikası olduğundan emin olun:
- **Marka adı** "Meridian Supply Co." (`src/lib/site.ts` içindeki `SITE.name` ve sayfa metinleri).
- **Ücretsiz kargo eşiği 750 USD** ve **asgari sipariş 150 USD** (`SITE`).
- Üst çubuktaki "Net 30 for approved retailers" ve `/wholesale` sayfasındaki "1 day EIN decision",
  "0% membership fee", "48 states", "Net 30 after two prepaid orders" ifadeleri. Kasada Net-30 şu an her
  onaylı hesaba açık; metinle tutarlı olmayabilir.
- Ana sayfa **SSS cevapları** ve alt bilgideki ödeme/PCI ifadeleri.
- Ana sayfadaki **depo fotoğrafı yapay zekâ ile üretilmiş bir yer tutucudur**, gerçek deponuz değildir.
- Kargo çıkış noktası olarak **238 Lindbergh Pl, Paterson, NJ 07503** kullanılıyor. Depo başka yerdeyse
  `SITE.originZip` ve `SITE.city` değiştirilmelidir.

---

## 7. Diğer yollar (önermiyorum)

- **GoDaddy Node.js hosting** (beta): yalnızca GoDaddy'nin yönetilen **MySQL**'ini sunuyor, proje ise
  PostgreSQL'e yazılı; basın haberlerine göre dışarıya çıkış da yalnızca 80/443 portlarına açık. Ayrıca
  `package.json`'a `version` ve `main` eklenmeli, derleme paketleri `dependencies`'e taşınmalı. Bunların
  hiçbiri bu depoda yapılmadı ve GoDaddy'de denenmedi.
- **VPS** (GoDaddy veya başka): Node 22, PostgreSQL, Nginx ve sertifikayı kendiniz kurarsınız;
  güvenlik, yedekleme ve güncellemeler sizdedir. `npm ci && npm run build`, ardından `npm run start`
  (port 3000) ve Nginx ters proxy; yüklemeler için `client_max_body_size 5m`.

---

## 8. Sorun giderme

| Belirti | Neden / çözüm |
| --- | --- |
| Her sayfa 500, günlükte `DATABASE_URL is not set` | Vercel'de değişken yok/yanlış → ekleyin, yeniden deploy |
| `relation "…" does not exist` | `db/schema.sql` çalıştırılmadı (bkz. 3.1) |
| İlk istek yavaş veya zaman aşımı | Neon uyanıyor; yenileyin. Ücretli planda uykuyu kapatabilirsiniz |
| Bağlantı hatası `channel_binding` ile ilgili | Adresin sonundaki `&channel_binding=require` ifadesini silip deneyin (bu projede denenmedi) |
| Yüklemede `413` | Dosya 4 MB'tan büyük |
| Kasada kart formu yok | Stripe anahtarları eksik ya da `NEXT_PUBLIC_…` değeri eklenip yeniden deploy edilmedi |
| E-posta gelmiyor | Resend'de alan adı **Verified** değil ya da `RESEND_FROM` doğrulanmış alan adında değil |
| Vercel "Invalid Configuration" | DNS kayıtları yanlış veya yayılıyor; eski `@` A kaydını sildiniz mi? |
| Sitemap'te yanlış alan adı | `NEXT_PUBLIC_SITE_URL` düzeltip yeniden deploy |
| Admin `/account/security`'ye yönlendiriyor | Personel hesabında 2FA kurulmamış; sayfadaki adımları izleyin |
| Telefon kayboldu, kurtarma kodu da yok | Başka bir sahip `/admin/users`'tan *2FA reset* yapar. Tek sahipseniz Neon SQL Editor'de: `UPDATE users SET totp_secret=NULL, totp_enabled_at=NULL, totp_last_step=NULL, recovery_codes='[]' WHERE email='…';` sonra hemen yeniden kurun |
| Cron raporunda `stockDrift` dolu | Stok sütunu lotlarla uyuşmuyor (ör. veritabanına elle stok yazıldı). Lotlardan düzeltin; `products.stock`'u elle değiştirmeyin |

---

## 9. Şema değişirse

`src/db/schema.ts` değiştiğinde iki dosya birlikte güncellenir:
- `npm run db:export` → `db/schema.sql` (yalnızca **boş** veritabanı kurulumu için).
- `db/migrations/NNNN_*.sql` → dolu (Neon) veritabanı için, tekrar çalıştırılabilir artımlı SQL.

Migration'ları **elle yapıştırmayın**; koşucu sırayı ve hangisinin uygulandığını kendisi takip eder
(`schema_migrations` tablosu — koşucu yoksa oluşturur, `db/schema.sql`'in parçası değildir):

```bash
export DATABASE_URL="postgresql://…"        # Neon connection string (direct endpoint tercih edin)
npm run db:migrate:status                   # ne uygulanmış, ne bekliyor
npm run db:migrate -- --yes                 # bekleyenleri sırayla uygula (--yes: uzak veritabanı onayı)
```

- Her dosya kendi transaction'ındadır; biri patlarsa kayda geçmez ve koşucu orada durur.
- Uygulanmış bir dosya sonradan değiştirilirse koşucu checksum uyuşmazlığını uyarı olarak basar.
- **Zaten elle uygulanmış** bir veritabanını koşucuya devretmek için bir kez
  `npm run db:migrate -- --baseline --yes`: bekleyen dosyaları *çalıştırmadan* uygulanmış olarak işaretler.
- Deploy sırası önemliyse (ör. `0005` deploy öncesi, `0006` sonrası) tablodaki "Ne zaman" sütununa uyun.

CI, `main`'deki şema + migration'ların `db/schema.sql` ile birebir aynı sonucu verdiğini ve koşucunun temiz bir
şemayı doğru raporladığını her PR'da kontrol eder. `drizzle-kit push` kullanmayın: veri taşıma adımlarını
(ör. Faz 1'de mevcut stoğun açılış lotuna dönüşmesi) yapmaz.

| Migration | Ne zaman | Not |
|---|---|---|
| `0001_faz0.sql` | Faz 0 deploy'undan önce | Uygulandı (19 Ekim 2026) |
| `0002_faz1.sql` | Faz 1 deploy'undan **hemen** önce | Mevcut stok `<SKU>-OPENING` lotuna taşınır (best-by boş — `/admin/inventory`'de girin). Migration ile deploy arasında sipariş gelirse cron `stockDrift` raporlar |
| `0003_return_items_unique.sql` | İade düzeltmeleriyle aynı deploy'da | Aynı sipariş satırını iki kez içeren iade satırlarını tek satıra toplar, sonra `return_items(return_id, order_item_id)` için tekil indeks ekler |
| `0004_coupon_rules.sql` | Faz 2 sepet/kupon deploy'undan önce (0003'ten sonra) | Kupona tarih, kullanım limiti, tier ve stacking alanları; `coupon_redemptions` tablosu. Kuponlu mevcut siparişler kullanım kaydına dönüştürülür ve `redeemed_count` buna göre ayarlanır |
| `0005_weight_ounces.sql` | Faz 2 kargo deploy'undan **önce** | `weight_oz` sütununu ekler ve `weight_lbs × 16` ile doldurur, eski sütunu NULL kabul eder. Eski kod çalışmaya devam eder — kesinti yok |
| `0006_drop_weight_lbs.sql` | Faz 2 kargo deploy'u canlıya çıktıktan **sonra** | Artık kullanılmayan `weight_lbs` sütununu düşürür. Önce çalıştırılırsa canlıdaki eski kod ürün sayfalarında hata verir |
| `0007_performance_indexes.sql` | Performans deploy'uyla birlikte (öncesi veya sonrası fark etmez) | Jeton aramaları, hesap sipariş geçmişi, admin listeleri ve gecelik temizlik için eksik indeksler. Veriye dokunmaz |
| `0008_server_cart.sql` | Sunucu sepeti deploy'undan önce | `carts` ve `cart_items` tabloları. Olmadan yeni kod sepet senkronunda hata verir (misafir sepeti etkilenmez) |
| `0009_account_prices.sql` | Sözleşmeli fiyat deploy'undan önce | `account_prices` tablosu. Olmadan yeni kod teklif ve sipariş fiyatlamasında hata verir |
| `0010_quote_requests.sql` | RFQ deploy'undan önce | `quote_requests` ve `quote_items` tabloları. Olmadan teklif ekranları ve gecelik cron hata verir |
| `0011_company_accounts.sql` | Firma hesabı deploy'undan önce | `companies`, `company_invites` ve `company_id` sütunları. **Mevcut hesaplar birleştirilmez** — herkes bugünkü gibi tek kişilik devam eder, firma hesabı `/account/team`'den kurulur |
| `0012_credit_terms.sql` | Kredi kontrolü deploy'undan önce | Kredi limiti / vade / hold sütunları ve `orders.due_at`. **Varsayılan limit 0'dır: migration sonrası Net-30 siparişleri, ticaret masası limit verene kadar reddedilir.** Mevcut açık faturalara 30 günlük vade tarihi yazılır |
