# Ciputra Corp — Uçtan Uca İnceleme ve İş Planı

**Tarih:** 19 Ekim 2026 · **Kapsam:** `main` dalı, commit `25d58d2` sonrası.
**Bakış açısı:** ABD pazarında toptan (B2B) satış yapan e-ticaret sitesi — güvenlik, ödeme ve sipariş bütünlüğü,
sepet/stok, vergi, kargo, ürün verisi, UI/UX, performans, kod kalitesi, dağıtım, bağımlılıklar.
**Yöntem:** Dört alanda satır satır kod incelemesi; kritik bulgular kodda ikinci kez doğrulandı. Hiçbir kod
değiştirilmedi. Gerçek Stripe/TaxJar/EasyPost anahtarıyla çalıştırma yapılmadı.

Örnek alınan toptancı sitelerinin kalıpları ve hangi faza girdikleri: `REFERANS-SITELER.md`.
Bu belge `B2B_ROADMAP.md`'nin yerine geçer. O belgedeki kapatılmış maddeler §1'de, açık kalanlar aşağıdaki
iş kalemlerine taşındı. Hukuk, vergi kaydı ve sigorta gibi kod dışı işler için `B2B_ROADMAP.md` §6 geçerliliğini korur.

---

## 0. Yönetici özeti

**Karar: Site gerçek müşteriden kartla para almaya hazır değil.** Yaklaşık 3 haftalık "Faz 0" işi bitmeden
yalnızca kapalı test yapılmalı.

En önemli 6 sorun:

1. **Kart çekilip sipariş oluşmayabiliyor.** Ödeme tarayıcıda onaylandıktan sonra sipariş isteği; fiyat değişimi,
   stok bitmesi, sunucu hatası veya sekme kapanması yüzünden reddedilirse para alınmış, sipariş yok, iade yok,
   kayıt yok. Hata mesajı da "No payment was captured" diyerek yanlış bilgi veriyor. (ODE-1)
2. **Vergi her eyalette ve uydurma oranla alınıyor.** Nexus (vergi yükümlülüğü) kontrolü yok; ZIP'e göre "yerel fark"
   rastgele türetiliyor; gıda/kargo vergilendirmesi yanlış; muafiyet her eyalette geçiyor. Kayıtlı olmadığınız
   eyalette vergi toplamak doğrudan hukuki risk. (VRG-1…5)
3. **EasyPost açılırsa müşteri kargo seçeneği seçemiyor.** Her teklifte yeni ID üretildiği için seçim kayboluyor,
   ilk seçenek sessizce uygulanıyor ve 1. madde tetikleniyor. (KRG-1)
4. **Başkasının sipariş geçmişi görülebiliyor.** Kurbanın e-postasıyla kayıt olan biri doğrulama yapmadan hesap
   sayfasında o e-postaya ait misafir siparişleri ve EIN'i görüyor; toptan başvuru onayı da hesabı
   "e-posta doğrulandı" yapıyor. (KYT-1, KYT-2)
5. **Asgari koli adedi ve asgari sipariş tutarı ($150) sunucuda zorunlu değil.** 1 koli, 1 dolarlık sipariş
   ACH/Net-30 ile geçiyor. (SEP-1, SEP-2)
6. **Ürün verisi ABD toptan/pazaryeri için eksik.** ASIN, Amazon bağlantısı, UPC/GTIN, MAP fiyatı, maliyet, parti/SKT,
   alerjen, Supplement Facts, FDA uyarısı, Prop 65, hazmat, vergi kodu alanı yok. (URN-1)

İyi durumda olanlar: oturumlar hash'li ve httpOnly; her admin uç noktası yetki kontrolü yapıyor; fiyat her adımda
sunucuda yeniden hesaplanıyor; stok düşümü transaction içinde ve eşzamanlı siparişte eksiye düşmüyor; hız sınırı
Postgres üzerinden paylaşımlı; üretim bağımlılıklarında `npm audit` 0 açık.

---

## 1. Önceki yol haritasından kapatılanlar

| Eski madde | Durum |
|---|---|
| P0-1 Başkasının siparişini görme (`/order/<no>`) | ✅ Kapatıldı: erişim anahtarı + sahiplik kontrolü. **Ama** hesap sayfasında yeni bir yol var (KYT-2) |
| P0-2 Demo parolalar | ✅ Canlı modda kapalı |
| P0-3 Stoktan fazla sipariş | ✅ Stok kısmı kapatıldı · ❌ MOQ ve asgari tutar açık (SEP-1, SEP-2) |
| P0-5 Hız sınırı | ✅ Kapatıldı · ⚠️ Hesap kilitleme kötüye kullanılabilir (KYT-9) |
| P0-6 Ödeme bütünlüğü | ⚠️ Kısmen: `payment_ref` benzersiz, sipariş no rastgele · ❌ Webhook, iade, idempotency yok (ODE-1…4) |
| P0-7 `xlsx` açığı | ✅ `exceljs`'e geçildi |
| P2-11 Düz metin jetonlar | ⚠️ Oturumlar hash'li · ❌ Şifre sıfırlama/doğrulama jetonları hâlâ düz metin (KYT-3) |
| P0-4, P0-8, P0-9 ve tüm P1/P2/P3 | ❌ Açık — aşağıda yeniden sınıflandırıldı |

---

## 2. Bulgular ve iş kalemleri

**Önem:** 🔴 Kritik (para/veri kaybı, hukuki risk — canlı öncesi şart) · 🟠 Yüksek · 🟡 Orta · ⚪ Düşük
**Efor:** 1 geliştirici iş günü (g), ±%40.

### A. Ödeme ve sipariş bütünlüğü (ODE)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| ODE-1 | 🔴 | **Tahsilat var, sipariş yok.** Ödeme tarayıcıda onaylandıktan sonra `/api/orders` tutar uyuşmazlığı (409), stok bitmesi (409), 500 veya sekme kapanması ile düşerse para iade edilmiyor ve hiçbir yerde kaydı yok. | `api/orders/route.ts:139-144, 250-254, 300-302` | Stripe **webhook** (`payment_intent.succeeded`, `payment_failed`, `charge.refunded`) ile siparişi sunucuda oluştur/eşleştir. Tercihen `capture_method: "manual"`: önce sipariş + stok rezervasyonu, sonra capture; başarısızlıkta `cancel`. PaymentIntent metadata'sına sepet hash'i ve müşteri id. 500 mesajını düzelt. | 3 g |
| ODE-2 | 🟠 | **3DS/yönlendirmeli ödeme ve gecikmeli yöntemler işlenmiyor.** `return_url` dönüşü okunmuyor; ACH `processing` durumunda "tekrar deneyin" deniyor → çift ödeme. | `StripePaymentPanel.tsx:28-41`, `payment-intent/route.ts:67` | Dönüş sayfasında `payment_intent` + `redirect_status` işle; `processing` = "ödeme alınıyor" durumu; webhook ile tamamla. Kart dışı yöntemleri açıkça sınırla. | 1,5 g |
| ODE-3 | 🟠 | **Idempotency yok.** Ödeme adımına her girişte yeni PaymentIntent; ACH/Net-30 siparişi ağ hatasında yeniden gönderilirse çift sipariş ve çift stok düşümü. | `payment-intent/route.ts:64`, `CheckoutFlow.tsx:158-185` | Checkout oturumu başına tek intent (update), `Idempotency-Key` başlığı + `orders.idempotency_key` benzersiz. | 1 g |
| ODE-4 | 🟠 | **İptal/iade akışı yok; durum makinesi yok.** `cancelled → shipped` mümkün; iptal stok iade etmiyor, Stripe iadesi yok; ödenmemiş sipariş "shipped" olabiliyor; admin notu müşteri notunun üzerine yazılıyor. | `admin/orders/[id]/route.ts:54-71` | İzinli geçiş tablosu; iptalde tek transaction'da stok iadesi + Stripe refund; kısmi iade; ayrı `admin_notes`; durum geçmişi tablosu (`order_events`). | 3 g |
| ODE-5 | 🟠 | **Misafir ACH siparişleri stoğu süresiz kilitliyor.** Doğrulanmamış e-postayla saatte 20 adet, 999 koliye kadar `awaiting_payment` sipariş; hiçbir zaman düşmüyor. | `orders/route.ts:127-129` | ACH için hesap zorunlu veya tutar sınırı; X gün ödenmeyen siparişi Vercel Cron ile iptal et + stok iade. | 1 g |
| ODE-6 | 🟡 | **Net-30'da kredi kontrolü yok.** Limit, vade tarihi, geciken fatura kontrolü, hesap dondurma yok. | `orders/route.ts:112-126` | `credit_limit`, `payment_terms_days`, `due_at`; açık bakiye + yeni sipariş > limit → red; vadesi geçmiş fatura → red. Fatura PDF'i. | 4 g |
| ODE-7 | 🟡 | **İndirim satırlara dağıtılmıyor.** Kupon/hesap indirimi kalemlere bölünmediği için satır toplamı ≠ sipariş toplamı; kısmi iade ve satır bazlı vergi hesaplanamaz. | `orders/route.ts:234-245` | İndirimi satırlara oransal dağıt (kuruş farkını son satıra), satır bazında `discount`, `taxable`, `tax` sakla. | 1 g |

### B. Kullanıcı girişi ve yetkilendirme (KYT)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| KYT-1 | 🔴 | **Toptan başvuru onayı e-postayı "doğrulandı" yapıyor.** Kurbanın e-postasıyla kayıt + başvuru → admin onayı → hesap doğrulanmış sayılır → o e-postaya ait tüm misafir siparişleri `/order/*` üzerinden açılır. E-posta eşleşmesiyle başkasının hesabının şirket/EIN/tier'ı da değiştirilebilir. | `admin/applications/[id]/route.ts:50-67`, `wholesale/apply/route.ts:48-58` | Onayda `emailVerified`'a dokunma; başvuruyu yalnızca oturumdaki kullanıcıya bağla ve başvuru e-postası = doğrulanmış oturum e-postası şartı; yalnızca `pending` başvuru onaylanabilsin. | 0,5 g |
| KYT-2 | 🔴 | **Doğrulanmamış hesap başkasının siparişlerini görüyor.** Hesap sayfası siparişleri ve başvuruyu `userId OR email` ile çekiyor, `emailVerified` kontrolü yok: sipariş no, tutar, takip no, şirket, EIN görünür. | `app/account/page.tsx:43, 50, 61` | E-posta eşleşmesini yalnızca `user.emailVerified` ise uygula. | 0,25 g |
| KYT-3 | 🟠 | **Şifre sıfırlama ve doğrulama jetonları düz metin.** Veritabanı okuma erişimi = bekleyen sıfırlaması olan hesabı ele geçirme. Sıfırlama "select sonra update" (yarış). | `forgot-password/route.ts:36`, `signup/route.ts:56`, `reset-password/route.ts:20-36`, `verify/route.ts:14` | SHA-256 özeti sakla (oturumdaki gibi); tek atomik `UPDATE … WHERE token=$h AND expires>now() RETURNING`. | 0,5 g |
| KYT-4 | 🟠 | **Admin işlemlerinde güvence ve iz yok.** Herhangi bir admin, doğrulanmamış hesabı admin yapabilir; %40 indirim, vergi muafiyeti, "ödendi" işaretleme kayıtsız. 2FA yok. | `admin/users/[id]/route.ts:32-55`, `admin/orders/[id]/route.ts:47` | Salt-ekleme `audit_log` tablosu (kim, ne, önce/sonra); rol değişikliğinde parola tekrarı + kullanıcıya e-posta; admin için TOTP 2FA; roller (operasyon / satış / muhasebe / salt okunur). | 3 g |
| KYT-5 | 🟡 | **Açık yönlendirme.** `/login?next=https://kotu.site` girişten sonra dış siteye gönderiyor (oltalama). | `AuthForm.tsx:95, 178`, `login/page.tsx:16` | Yalnızca `/` ile başlayıp `//` ile başlamayan değerleri kabul et. | 0,1 g |
| KYT-6 | 🟡 | **Origin/Content-Type kontrolü yok.** `text/plain` gövdeli siteler arası form ile kurban saldırganın hesabına giriş yaptırılabilir (login CSRF). | tüm `api/**` POST'lar, `auth.ts:67` | `src/proxy.ts`: `/api/**` değiştiren isteklerde `Origin` = site adresi ve `application/json` / `multipart/form-data` şartı. | 0,5 g |
| KYT-7 | 🟡 | **E-posta bağlantılarının alan adı istekten alınıyor** (Host başlığı zehirlenmesi; Vercel'de düşük risk). | `forgot-password/route.ts:22`, `signup:67`, `resend-verification:24` | Bağlantıyı `SITE.domain`'den üret. | 0,1 g |
| KYT-8 | 🟡 | **Hesap var/yok bilgisi sızıyor.** Kayıt 409 dönüyor; bilinmeyen e-postada giriş ölçülebilir şekilde hızlı. | `signup/route.ts:38-43`, `login/route.ts:26` | Bilinmeyen kullanıcıda sahte hash ile `verifyPassword`; kayıtta aynı yanıt + mevcut sahibine e-posta. | 0,5 g |
| KYT-9 | 🟡 | **Hesap kilitleme kötüye kullanılabilir; doğrulama e-postası tekrar gönderiminde sınır yok.** Herkes bir alıcıyı/admini 15 dk'lık kilitlerle sürekli dışarıda tutabilir; kurbanın kutusu doldurulabilir. | `login/route.ts:22`, `resend-verification` | Hesap+IP anahtarı + daha gevşek global sınır; tekrar gönderime hız sınırı. | 0,5 g |
| KYT-10 | ⚪ | **Oturum yönetimi zayıf.** Admin dahil 30 gün sabit; girişte eski oturum silinmiyor; "her yerden çık", oturumdayken parola değiştirme ve e-posta değiştirme akışı yok; `scryptSync` event loop'u kilitliyor; parola kuralı yalnızca ≥8 karakter. | `auth.ts`, `password.ts`, `signup:33` | Admin için 8 saat + boşta kalma süresi; girişte eski oturumu sil; async `scrypt`; ≤256 karakter + sızmış parola kontrolü (HIBP k-anonymity); hesap ayarları sayfası. | 2 g |
| KYT-11 | ⚪ | **Başvuru doğrulaması yüzeysel.** Onay `verifiedEin: true` yazıyor (admin'in gönderdiği değer yok sayılıyor); EIN yalnızca biçim (geçersiz önekler, mükerrer EIN geçiyor); başvuru tekrar tekrar onaylanabiliyor. | `admin/applications/[id]:22, 44`, `wholesale/apply:35` | `verifyEin` değerini kullan; IRS önek listesi; mükerrer EIN uyarısı; durum geçişini zorunlu kıl; belge yükleme (resale certificate, W-9). | 1,5 g |

### C. Sepet kontrolleri (SEP)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| SEP-1 | 🟠 | **Asgari koli (MOQ) ve koli katı zorunlu değil.** "Sepete ekle" 1 koli ekliyor, sepet 1'e kadar indirilebiliyor, `priceCart` `minCases`'i yalnızca kademe için okuyor. | `checkout.ts:109-138`, `ProductCard.tsx:96-111`, `CartProvider.tsx:98, 117`, `CartDrawer.tsx:112`, `QuickOrderPanel.tsx:102` | `priceCart`'ta `cases < minCases` → hata; `order_multiple` alanı + kontrol; arayüzde varsayılan ve alt sınır `minCases`. | 0,5 g |
| SEP-2 | 🟠 | **Asgari sipariş tutarı ($150) yalnızca mesaj.** | `checkout.ts:228-232` | `priceCart` hata dönsün (veya yalnızca kargo bedava eşiği olarak kalacaksa metni düzelt — iş kararı). | 0,25 g |
| SEP-3 | 🟡 | **Sepet fiyatı bayatlıyor.** Sepet, ürünün eklendiği andaki kademe/hesap fiyatını localStorage'da tutuyor; çekmece ara toplamı ve asgari tutar ipucu bu eski fiyatla hesaplanıyor; çıkış yapınca toptan fiyat görünmeye devam ediyor. | `CartProvider.tsx:96-106`, `BuyBox.tsx:47`, `QuickOrderPanel.tsx:192` | Sepette yalnızca `{productId, cases}` sakla; görüntüyü `/api/checkout/quote` ile yeniden fiyatla. | 1 g |
| SEP-4 | 🟡 | **Pasif/silinmiş ürün sessizce düşüyor.** Ödeme özeti localStorage'dan çiziliyor, toplam sunucudan → ürün görünür, ücreti yok; sipariş sonrası habersiz siliniyor. | `checkout.ts:111`, `CheckoutFlow.tsx:691-708` | Satır bazında uyarı dön; özeti `quote.lines`'tan çiz. | 0,5 g |
| SEP-5 | 🟡 | **999 koli üstü sessizce 999'a kırpılıyor; aynı ürün iki satırda birleşmiyor.** | `checkout.ts:92` | Reddet veya uyar; `productId`'ye göre birleştir. | 0,25 g |
| SEP-6 | 🟡 | **Kupon kuralları yok.** Başlangıç/bitiş tarihi, kullanım limiti, müşteri başı limit, müşteri tipi kısıtı, kullanım kaydı yok; yüzde kupon kademe + %40 toptan indirimin üstüne sınırsız biniyor; bedava kargo kuponu 2nd Day Air'i de sıfırlıyor. | `schema.ts:146-159`, `checkout.ts:154-174, 198` | `starts_at`, `expires_at`, `max_redemptions`, `per_customer_limit`, `allowed_tiers`, `stackable`; `coupon_redemptions` tablosu; sayaç sipariş transaction'ında koşullu artış; bedava kargo yalnız ground; admin kupon ekranı. | 2 g |
| SEP-7 | ⚪ | **Sunucu tarafı sepet yok.** Cihazlar arası ve girişte birleşme, kayıtlı sepet/satın alma listesi, terk edilmiş sepet e-postası, geçmiş siparişten tekrar sipariş yok. | `CartProvider.tsx` | `carts`/`cart_items` tabloları; girişte birleştirme; "reorder"; terk edilmiş sepet için Cron + e-posta. | 3 g |

### D. Stok kontrolleri (STK)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| STK-1 | 🟠 | **Admin düzenlemesi ve katalog içe aktarma stoğu ezer.** Admin kaydı stoğu mutlak değere yazar (arada gelen siparişlerin düşümü kaybolur); içe aktarma dosyadaki değere, sütun yoksa **50'ye** sıfırlar. | `admin/products/[id]/route.ts:56-61`, `catalog-import.ts:212`, `admin/catalog/route.ts:77` | Stok değişikliği yalnızca fark (`+/-`) ile ve gerekçeyle; içe aktarmada sütun yoksa stoğa dokunma; iyimser sürüm kontrolü. | 1 g |
| STK-2 | 🟠 | **Stok hareket defteri yok.** Stoğun neden değiştiği (sipariş, iptal, düzeltme, içe aktarma, mal kabul) izlenemiyor; sayım farkı açıklanamaz. | — | `inventory_movements` (product, lot, delta, reason, ref, user, at); `products.stock` bunun toplamı. | 2 g |
| STK-3 | 🟠 | **Parti (lot) ve son kullanma takibi yok (FEFO).** Takviye ve gıdada geri çağırma (recall) ve SKT yönetimi için zorunlu. | `schema.ts` | `product_lots` (lot_no, expiry, qty, received_at, supplier); siparişte en yakın SKT'den düş; sevkte lot no'yu sipariş kalemine yaz; SKT'ye X gün kala uyarı ve satıştan çekme. | 4 g |
| STK-4 | 🟡 | **Rezervasyon, düşük stok eşiği ve ön sipariş yok.** "60 dakika ayrıldı" mesajı gerçek değil; eşik 10'a sabit; sepete ekleme stokla sınırlı değil; admin'e düşük stok bildirimi yok. | `BuyBox.tsx:167`, `QuickOrderPanel.tsx:400` | Yanıltıcı metni kaldır; ürün başı `reorder_point` + bildirim; `allow_backorder` + tahmini tarih; isteğe bağlı süreli rezervasyon. | 1,5 g |
| STK-5 | ⚪ | **Hızlı sipariş ucu pasif ürünlerin fiyat/stoğunu gösteriyor; hız sınırı yok; kademe fiyatı uygulamıyor.** | `api/quick-order/route.ts:34-60` | `active` filtresi, hız sınırı, `resolveCasePrice`. | 0,25 g |

### E. Vergi (VRG)

> Vergi kalemleri işletmenin **nexus analizi ve eyalet kaydı** ile birlikte yürür. Kayıt olmadığınız eyalette
> vergi toplamak da, kayıt olduğunuz eyalette toplamamak da sorumluluk doğurur. Kesin kurallar için mali müşavir.

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| VRG-1 | 🔴 | **Nexus kontrolü yok; 45 eyalette vergi alınıyor.** Bilinmeyen eyalet kodu %6 varsayılan. Ohio'ya $2.000'lık siparişte kayıtlı olmadığınız ~%7,2 vergi toplanır. | `tax.ts:17-36, 89-102` | `NEXUS_STATES` yapılandırması (başlangıç: NJ); dışında vergi 0; eyalet bazlı satış toplamı raporu ile ekonomik nexus eşiklerini (Wayfair) izle. | 1 g |
| VRG-2 | 🔴 | **Yedek oran tablosu uydurma.** ZIP'in son iki hanesinden ±%0,225 "yerel fark" türetiliyor; NJ'de yerel vergi yok (eyalet geneli %6,625; UEZ bölgelerinde %3,3125), sistem 07001 için %6,475 hesaplıyor. | `tax.ts:32-33` | NJ için sabit oran; diğer nexus eyaletleri için gerçek servis (TaxJar/Stripe Tax/Avalara) zorunlu; canlıda tahmini oranla teklif verme. | 0,5 g |
| VRG-3 | 🔴 | **Vergi kullanıcının seçtiği eyalete göre.** ZIP–eyalet uyumu kontrol edilmiyor: eyalet=DE, ZIP=07503 (NJ) → vergi $0, kargo NJ'ye gider. | `checkout.ts:208-215`, `orders/route.ts:73-78` | Eyaleti ZIP'ten türet veya adres doğrulama (EasyPost Address Verification) ile uyuşmazlığı reddet. | 0,5 g |
| VRG-4 | 🔴 | **Muafiyet sertifikasız ve her eyalette geçerli.** `taxExemptState` ship-to ile karşılaştırılmıyor; admin varsayılanı `"US"`; sertifika no/belge/tür/son tarih yok ama müşteriye "sertifika numarası hesapta kayıtlı" deniyor; onay kutusu varsayılan "muaf"; perakendeye düşürülen hesabın muafiyeti kalıyor. | `tax.ts:48-57`, `checkout.ts:214`, `admin/users/[id]:42-43`, `admin/applications/[id]:44, 64`, `AdminApplications.tsx:41` | `tax_exemptions` tablosu (eyalet, tür: NJ ST-3/ST-3NR, MTC, SST; no; belge; son tarih; doğrulayan); yalnızca ship-to eyaleti için geçerli ve süresi dolmamış sertifika varsa muaf; varsayılan "muaf değil"; yanıltıcı metni düzelt; yenileme hatırlatması. | 3 g |
| VRG-5 | 🟠 | **Ürün vergi sınıfı yok; kargo her zaman vergili.** NJ'de gıda (kiler ürünleri) muaf; takviyeler eyaletten eyalete farklı; NJ'de kargo yalnızca vergili kısma oranla vergilenir; CA/FL ayrı gösterilen kargoyu genelde vergilemez. | `checkout.ts:207`, `schema.ts:88-126` | `products.tax_code` (TaxJar PTC); satır bazlı vergi; kargonun vergilenmesi eyalet kuralından. | 1,5 g |
| VRG-6 | 🟠 | **TaxJar yanlış uçla çağrılıyor ve hata sessizce uydurma tabloya düşüyor.** `/v2/rates/:zip` yalnızca oran döner (nexus, ürün kodu, kargo, sokak, çıkış adresi yok); hata loglanmıyor; `Math.round(combined*1000)` %6,625'i %6,6'ya yuvarlıyor. | `tax.ts:59-87` | `POST /v2/taxes` (`from_*`, `to_street`, `nexus_addresses`, `line_items[].product_tax_code`, `shipping`); oran hassasiyetini artır; canlıda hata = sipariş durdur + log. | 1,5 g |
| VRG-7 | 🟡 | **Beyanname ve iade için kayıt yok.** Siparişte yalnızca oran ve tutar; yargı bölgesi dökümü, vergilenen matrah, kaynak, sertifika referansı yok; TaxJar `/transactions`'a gönderim yok; vergi iadesi yolu yok. Müşteriye gösterilen "Freight taxable in this state" metni çoğu eyalette yanlış. | `schema.ts:214-216`, `orders/route.ts:219-221`, `tax.ts:100` | `tax_breakdown` JSON, `tax_source`, `taxable_amount`, `exemption_id`; siparişi ve iadeyi TaxJar'a raporla; eyalete göre aylık vergi raporu (admin). | 2 g |

### F. Kargo (KRG)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| KRG-1 | 🔴 | **EasyPost seçimi kayboluyor.** Her teklif yeni shipment ve yeni rate ID üretiyor; seçilen ID bulunamayınca `options[0]` sessizce uygulanıyor → müşteri 2nd Day seçer, Ground ödenir veya tutar uyuşmazlığı → ODE-1. | `shipping.ts:213`, `checkout.ts:193-196` | Kararlı ID (`carrier:service`); shipment ID'yi teklif süresiyle sakla; seçilen servis yoksa reddet, yerine koyma. | 1 g |
| KRG-2 | 🟠 | **Canlı fiyat tek dev koli olarak alınıyor.** Tüm sipariş tek paket (yükseklik 70"e kadar üst üste); 150 lb üstü parsel fiyatı "LTL" etiketiyle; sokak/konut bilgisi yok; EasyPost hatası sessizce matrise düşüyor. | `shipping.ts:162-191, 218, 259-268` | Koli başına parcel (EasyPost Order); EasyPost'u parsel boyutuna sınırla; gerçek LTL API'si (ör. bir LTL aracı); konut/ticari bayrağı; geri düşüşleri logla. | 4 g |
| KRG-3 | 🟠 | **LTL modeli uydurma.** Sabit "class 100", NMFC yok; ≥40 lb koli zorla LTL ($185 asgari, UPS 150 lb'ye kadar alır); palet = ceil(lb/1200); liftgate, konut teslimi, randevu gibi ek hizmet bedeli yok; "Ciputra Freight (LTL)" gerçek bir taşıyıcı değil. | `shipping.ts:77, 98-108` | Ürüne `freight_class`, `nmfc`, `units_per_pallet`, `ti`, `hi`; gerçek LTL fiyatı; ek hizmet seçenekleri; gerçek taşıyıcı adı. | 3 g |
| KRG-4 | 🟡 | **Bedava kargo ($750) yalnızca EasyPost kapalıyken uygulanıyor**; eşik metinde sabit; başlık bölge sınırı olmadan vaat ediyor. | `shipping.ts:95, 134` | Eşiği teklif sonrası tek yerde uygula; `SITE.freeFreightThreshold`'dan oku; kapsamı (48 eyalet, ground) metinde belirt. | 0,5 g |
| KRG-5 | 🟡 | **Adres kontrolü yok.** PO Box (LTL/UPS teslim etmez), APO/FPO, PR/bölgeler yok; AK/HI zone 8 ground/LTL fiyatlanıyor; adres doğrulama yok. | `orders/route.ts:73-78`, `site.ts:87-139` | EasyPost adres doğrulama; PO Box tespiti; AK/HI/PR için ayrı kural veya engel; ilk aşamada "yalnızca 48 bitişik eyalet" kararı. | 1 g |
| KRG-6 | 🟡 | **Ağırlık tamsayı lb; paketleme ağırlığı sipariş başına bir kez; fatura ağırlığı koli bazında değil.** 0,6 lb'lik koli 0 veya 1 olur. | `schema.ts:106`, `shipping.ts:75` | `weight_oz` veya `numeric(8,2)`; koli başı `max(gerçek, boyutsal)`. | 1 g |
| KRG-7 | 🟡 | **Tehlikeli madde (hazmat) bayrağı yok.** Difüzör yağları, aerosoller, kokulu sıvılar sınırlı miktar/hazmat olabilir; her ürüne hava kargo sunuluyor. | `products` | `products.hazmat` (+ UN no / sınıf); hazmat sepette hava servislerini gizle. | 0,5 g |
| KRG-8 | ⚪ | **Yanıltıcı teslim metinleri.** 2nd Day Air için "Guaranteed by 10:30am" yanlış; ground süreleri uydurma. | `shipping.ts:129, 147` | Gerçek servis taahhüdü veya EasyPost `delivery_days`. | 0,25 g |

### G. Ürün verisi ve katalog (URN)

**URN-1 🟠 — Eksik ürün alanları (önerilen şema).** ABD toptan + Amazon/pazaryeri bağlantılı katalog için:

| Grup | Alan | Not / doğrulama |
|---|---|---|
| **Kimlik** | `upc` / `ean` / `gtin14` | GS1 kontrol hanesi doğrulaması; benzersiz |
| | `case_gtin` (ITF-14) | Koli barkodu — depo ve perakende alıcılar ister |
| | `asin` | `^B0[0-9A-Z]{8}$` veya 10 haneli ISBN; benzersiz değil (aynı ASIN farklı paket olabilir) |
| | `amazon_url` | ASIN'den türet: `https://www.amazon.com/dp/{ASIN}`; elle girilen URL yalnızca `amazon.com` alan adı |
| | `mpn`, `manufacturer` | Şu an JSON-LD'de `mpn = sku` yazılıyor — yanlış |
| | `supplier_id`, `supplier_sku`, `supplier_url` | Tedarikçi tablosuna bağlanır |
| **Fiyat** | `cost_price` | Gerçek marj; admin dışında asla gösterilmez |
| | `map_price` | Asgari ilan fiyatı; MSRP'den ayrı |
| | `msrp_unit` | Mevcut — `msrp < birim maliyet` kontrolü eklenmeli |
| **Lojistik** | `weight` (ondalık), `units_per_pallet`, `ti`, `hi` | Palet ve LTL hesabı |
| | `freight_class`, `nmfc`, `hazmat`, `un_number` | KRG-3, KRG-7 |
| | `hts_code`, `country_of_origin` (ISO-3166 alfa-2) | Varsayılan "United States" kaldırılmalı — FTC "Made in USA" kuralı |
| **Vergi** | `tax_code` | VRG-5 |
| **Uyum (takviye/gıda)** | `shelf_life_days`, lot/SKT (STK-3) | |
| | `ingredients`, `allergens` (FALCPA 9 alerjen, çoklu seçim) | Gıda için zorunlu bilgi |
| | `facts_panel_image` | Supplement Facts / Nutrition Facts görseli |
| | `fda_disclaimer` | Yapı/işlev iddiası olan takviyede otomatik: *"These statements have not been evaluated by the Food and Drug Administration…"* (21 CFR 101.93) |
| | `prop65_warning` | CA'ya gönderimde gösterim |
| | `certifications` (belge dosyasıyla) | NSF/IFOS gibi rozetler **yalnızca belge yüklüyse** gösterilir |
| **Katalog** | `categories` tablosu | Şu an 3 sabit kategori |
| | varyantlar (boyut/aroma) | |
| | `seo_title`, `seo_description`, görsel `alt` ve boyutları | |

Efor: şema + admin formu + doğrulama + içe aktarma + JSON-LD ≈ **5 g** (varyantlar hariç; varyantlar +3 g).

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| URN-2 | 🟠 | **Katalog içe aktarma doğrulamayı atlıyor.** `validateProductInput` çağrılmıyor: kademe sırası, SKU biçimi, görsel URL'si, üst sınırlar kontrol edilmiyor; `ratingX10`/`reviewCount` dosyadan alınıyor; güncellemede slug ezilip linkler kırılıyor; transaction yok. | `catalog-import.ts:116-217`, `admin/catalog/route.ts:67-91` | Her satırı `validateProductInput`'tan geçir; puan alanlarını yok say; güncellemede slug'ı koru; tek transaction; satır bazlı hata raporu. | 1 g |
| URN-3 | 🔴 | **Sahte puan/yorum riski (FTC 16 CFR 465, Google).** `reviewCount > 0` ise gerçek yorum olmadan AggregateRating JSON-LD üretiliyor; yıldız dağılımı sabit %74/22/2; "verified trade buyers" metni — canlı modda da. | `products/[slug]/page.tsx:73, 97-107, 393, 404-408` | Puanı yalnızca gerçek `reviews` satırlarından hesapla; `rating_x10`/`review_count` sütunlarını kaldır veya türetilmiş yap; gerçek yorum akışı (teslim edilmiş siparişten davet + moderasyon). | 1 g (+2 g yorum akışı) |
| URN-4 | 🟡 | **JSON-LD hataları.** `gtin` yok; `mpn=sku`; `priceValidUntil` sabit 2027-12-31; `eligibleQuantity` koli içi adet (olmalı: `minCases`); marka varsayılanı şirket adı. | `products/[slug]/page.tsx:90-129`, `product-input.ts:227` | URN-1 alanlarıyla düzelt; Google Rich Results testi. | 0,5 g |
| URN-5 | 🟡 | **JSON-LD üzerinden script enjeksiyonu.** `JSON.stringify` `<` kaçırılmadan `dangerouslySetInnerHTML`'e yazılıyor; açıklamada `</script>` olan ürün (admin/içe aktarma) sayfaya script sokar. | `products/[slug]/page.tsx:192`, `layout.tsx:104` | `.replace(/</g, "\\u003c")` yardımcı fonksiyonu. | 0,1 g |
| URN-6 | 🟡 | **Ürün formu doğrulama boşlukları.** MSRP birim maliyetin altında olabilir (negatif marj rozeti); kademe `minCases`'in altında başlayabilir; `http://` görsel; slug benzersizliği LIKE taraması (yarış → 500); ürün silinince `product_images` öksüz kalıyor. | `product-input.ts:79, 162-165, 238`, `admin/products/route.ts:10-23` | Kuralları ekle; benzersiz ihlalini yakala; görsellere FK + cascade. | 0,5 g |

### H. UI/UX, erişilebilirlik ve yasal (UX)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| UX-1 | 🔴 | **Yasal sayfalar yok.** Gizlilik (CCPA/CPRA, CalOPPA zorunlu), Satış Şartları, İade, Kargo politikası, Erişilebilirlik beyanı; alt bilgide bağlantı yok. Stripe hesap incelemesinde de istenir. | `SiteFooter.tsx:10-34` | Hukukçu metinleriyle 5 sayfa + alt bilgi bağlantıları + checkout'ta "şartları kabul ediyorum". | 1 g + hukuk |
| UX-2 | 🟠 | **Doğrulanmamış iddialar.** Ürün metinlerinde NSF/FDA tesis/satış rakamı iddiaları (örnek veri), "allocation held for 60 minutes", "Guaranteed by 10:30am". | `catalog.ts`, `BuyBox.tsx:167`, `shipping.ts:147` | Metinleri gerçek bilgiyle değiştir; belgesiz sertifika rozeti gösterme. | 0,5 g + işletme |
| UX-3 | 🟡 | **Erişilebilirlik (ADA davası riski ABD'de yüksek).** Sepet çekmecesi `role="dialog"`/odak tuzağı yok; başlık aramasında etiket yok; menü düğmesinde `aria-expanded` yok; hızlı sipariş tablosunda etiketsiz alanlar; hiçbir yerde `aria-live` yok; 9,5–11 px ve `text-ink/40` metinler kontrast sınırının altında. | `CartDrawer.tsx:20-26`, `SiteHeader.tsx:54-61, 127-133`, `QuickOrderPanel` | WCAG 2.1 AA düzeltmeleri + axe ile otomatik kontrol. | 2 g |
| UX-4 | 🟡 | **Yükleme/hata sayfaları yok** (`loading.tsx`, `error.tsx`, `global-error.tsx`). Veritabanı uyurken (Neon) kullanıcı boş ekran görür. | `src/app` | Kök ve kritik rotalara ekle. | 0,5 g |
| UX-5 | 🟡 | **SEO: tüm sayfalar ana sayfaya canonical veriyor**; giriş/hesap/checkout/sipariş sayfaları `noindex` değil. | `layout.tsx:44` | Sayfa başı canonical; özel sayfalara `robots: noindex`. | 0,25 g |
| UX-6 | 🟡 | **Mağaza sayfası:** sayfalama yok; arama dört sütunda `ilike '%q%'` (açıklama dahil, indekssiz); marka/sertifika filtresi yok; ana sayfa fiyat listesi için tüm kataloğu yüklüyor. | `shop/page.tsx:92-96`, `page.tsx:133-137` | Sayfalama; `pg_trgm` veya Postgres tam metin araması; filtreler; listeleme için dar seçim. | 1,5 g |
| UX-7 | ⚪ | **B2B kolaylıkları:** fiyatın yalnızca onaylı hesaplara gösterilmesi seçeneği, hesap başı fiyat listesi, çok kullanıcılı firma hesabı, RFQ/teklif, fatura indirme. | — | Faz 2–3. | — |

### I. Performans (PRF)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| PRF-1 | 🟠 | **Tüm site dinamik.** Kök layout `force-dynamic` + her istekte `ensureSeeded()` ve `getSessionUser()` → katalog ve ürün sayfaları hiç önbelleklenmiyor, her istek veritabanına gidiyor (Neon soğuk başlangıcında saniyeler). | `layout.tsx:12, 56-57` | Oturuma bağlı başlığı istemci bileşeni/Suspense'e taşı; katalog sayfalarında `use cache` + admin düzenlemesinde `revalidateTag`; seed'i istek yolundan çıkar (canlıda zaten boş). | 2 g |
| PRF-2 | 🟡 | **Görseller ve font.** 11 adet `<img>`, `next/image` yok (AVIF/WebP, boyutlandırma yok); Google Fonts `<link>` ile (render engeller, lint uyarısı, ziyaretçi IP'si Google'a gider); ürün fotoğrafları Postgres'te `bytea`. | `layout.tsx:96-101`, 8 bileşen | `next/font/google`; `next/image`; fotoğrafları Vercel Blob'a taşı. | 1,5 g |
| PRF-3 | 🟡 | **Eksik indeksler ve tekrarlı sorgu.** `users.verification_token`, `users.reset_token`, `orders.email`, `orders.created_at`, `products(active, featured)`, `sessions.expires_at`, `rate_limits.reset_at`, arama için trigram yok; ürün sayfası aynı ürünü iki kez sorguluyor. | `schema.ts`, `products/[slug]/page.tsx:29, 51` | İndeksleri ekle; React `cache()`. | 0,5 g |
| PRF-4 | ⚪ | **İstemciye fazla veri.** `ProductCard` (client) tüm `Product` nesnesini (açıklama, hikâye, özellikler) alıyor. | `ProductCard.tsx` | Kart için dar tip. | 0,25 g |

### J. Kod kalitesi, dağıtım ve bağımlılıklar (DEV)

| # | Önem | Sorun | Kanıt | Çözüm | Efor |
|---|---|---|---|---|---|
| DEV-1 | 🔴 | **Hiç test ve CI yok.** Fiyat, vergi, kargo, stok ve ödeme gibi para hesaplayan kodun güvencesi yok. | — | Vitest ile `priceCart`, `quoteTax`, `quoteShipping`, `resolveCasePrice`, sipariş transaction'ı (gerçek Postgres, Testcontainers/Neon branch); Playwright ile checkout duman testi; GitHub Actions: typecheck + lint + test + build. | 4 g |
| DEV-2 | 🟠 | **Sürümlü migration yok.** Üretimde `drizzle-kit push`; `drizzle.config.json` localhost; `db/schema.sql` elle senkron. Yanlış push = veri kaybı. Yedek/PITR süreci yazılı değil. | `drizzle.config.json`, `DEPLOYMENT.md:218` | `drizzle-kit generate` + commit edilen `drizzle/` klasörü + CI/deploy'da `migrate`; config `DATABASE_URL`'den; her migration öncesi Neon branch; PITR açık. | 1 g |
| DEV-3 | 🟠 | **Gözlemlenebilirlik yok.** Hatalar yalnızca `console.error`; Sentry/`instrumentation.ts` yok; ödeme–sipariş uyuşmazlığı alarmı yok; uptime izleme yok. | — | Sentry (veya Vercel Observability) + yapılandırılmış log; ödeme/webhook hatalarında e-posta/Slack alarmı; `/api/health` için uptime. | 1 g |
| DEV-4 | 🟡 | **Zamanlanmış görev yok.** `sessions` ve `rate_limits` tabloları sonsuza kadar büyüyor; ödenmemiş ACH siparişi düşmüyor; SKT uyarısı yok. | — | `vercel.ts` / `vercel.json` cron: günlük temizlik, ödenmemiş sipariş iptali, SKT ve düşük stok raporu. | 0,5 g |
| DEV-5 | 🟡 | **Content-Security-Policy yok.** | `next.config.ts` | `default-src 'self'`; `script-src`/`frame-src` `js.stripe.com`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`. Önce report-only. | 0,5 g |
| DEV-6 | 🟡 | **Node sürümü sabit değil** (`>=20.9.0`, yerelde v26). `eslint-config-next` 16.2.6 ≠ `next` 16.4.2. | `package.json` | `engines.node: "24.x"`, `@types/node@24`; `eslint-config-next`'i `next` ile eşitle; küçük güncellemeler (react 19.3, pg 8.23, drizzle-orm 0.45.4, tailwind 4.3). TypeScript 7 / ESLint 10 sonraya. | 0,5 g |
| DEV-7 | ⚪ | **Geliştirme bağımlılıklarında 13 açık** (7 yüksek; eslint-config-next ve drizzle-kit zincirleri). Üretimde 0. | `npm audit` | Güncellemelerle birlikte izle; CI'da `npm audit --omit=dev` kapısı. | — |
| DEV-8 | ⚪ | **Marka karışık.** Arayüz "Ciputra", seed/dosya adları/çerez "Meridian", paket adı `nextjs-postgresql-template`. Depo herkese açık ve kaynakta demo parolaları var. | `seed.ts`, `package.json`, `auth.ts` | Kalan adları temizle; **depoyu private yap** (sahibi yapabilir). | 0,25 g |

---

## 3. Faz planı

> Varsayım: 1 tam zamanlı full-stack geliştirici. İki geliştiriciyle takvim yaklaşık %40 kısalır; Faz 0 içindeki
> ödeme işleri sıralıdır.

### Faz 0 — Güvenli, dürüst ve parayı kaybetmeyen site (Hafta 1–4, ≈18 g)

**Amaç:** Kapalı beta ile ilk gerçek müşteriler. Bu faz bitmeden kartla canlı satış yok.

| Sıra | Kalemler | Efor |
|---|---|---|
| 1 | **Hızlı güvenlik düzeltmeleri:** KYT-1, KYT-2, KYT-3, KYT-5, KYT-7, URN-5 | 1,5 g |
| 2 | **Sepet kuralları:** SEP-1, SEP-2, SEP-4, SEP-5, STK-5 | 1,5 g |
| 3 | **Ödeme bütünlüğü:** ODE-1, ODE-2, ODE-3, KRG-1 | 6,5 g |
| 4 | **Vergi asgarisi:** VRG-1, VRG-2, VRG-3, VRG-4 (sertifika tablosu dahil) | 5 g |
| 5 | **Test temeli:** DEV-1'in fiyat/vergi/stok/sipariş birim testleri + CI | 2 g |
| 6 | **Dürüstlük ve yasal:** URN-3, UX-1, UX-2 (işletme/hukuk metniyle) | 2,5 g |
| 7 | **Karar gereği eklenenler:** fiyat kilidi (UX-7 kısmi), 48 eyalet sınırı (KRG-5), misafir ACH süre aşımı (ODE-5) | 3 g |

**Kabul ölçütleri:**
- Stripe test modunda: ödeme sonrası sekme kapatılsa da sipariş webhook ile oluşur; tutar uyuşmazlığı/stok
  bitmesinde ödeme otomatik iptal/iade edilir; aynı `pi_…` iki siparişe dönüşmez; ağ hatasında yeniden gönderim
  çift sipariş üretmez; 3DS test kartı (`4000 0027 6000 3184`) siparişle sonuçlanır.
- EasyPost test anahtarıyla 2nd Day seçilir, 2nd Day ücretlendirilir.
- `minCases` altı ve $150 altı sepet hem teklifte hem siparişte reddedilir.
- Nexus dışı eyalete vergi 0; NJ %6,625; eyalet/ZIP uyuşmazlığı reddedilir; ME sertifikalı alıcı TX'e gönderince
  vergi öder; süresi dolmuş sertifika muafiyet vermez.
- Doğrulanmamış hesap başkasının siparişini/başvurusunu göremez; başvuru onayı e-postayı doğrulamaz;
  `/login?next=https://…` dış siteye gitmez.
- Gerçek yorum yoksa puan/yıldız/JSON-LD AggregateRating yok; 5 yasal sayfa alt bilgide.
- CI yeşil; `npm audit --omit=dev` 0.

#### Faz 0 durumu (19 Ekim 2026, `faz-0` dalı)

| Sıra | Durum | Commit | Not |
|---|---|---|---|
| 1 | ✅ | `e08c317` | Başvuru doğrulanmış hesaba bağlı; onay e-postayı doğrulamıyor; jetonlar hash'li ve tek kullanımlık; `next` yalnızca site içi; JSON-LD kaçışlı |
| 2 + 4 + KRG-5 | ✅ | `7ea9d67` | Engel (blocker) sistemi; $150 ve asgari koli zorunlu; 48 eyalet + DC, ZIP–eyalet, PO Box; NJ'ye özel vergi, gıda/takviye muaf, kargo oransal; sertifikalı ve yalnız NJ'de geçerli muafiyet. **VRG-5 de bu adımda yapıldı** (NJ gıdayı muaf tuttuğu için zorunluydu) |
| 7 (UX-7) + URN-3 | ✅ | `95def3e` | Fiyat yalnızca onaylı hesaplara; HTML/RSC'de fiyat yok; fiyat içeren API'ler 403; puan yalnızca gerçek yorumdan |
| 3 + ODE-5 | ✅ | `a32dcdc` | Provizyon → sipariş → tahsilat; checkout taslağı + webhook + cron; idempotency; 7 günde ödenmeyen ACH iptal |
| 5 | ✅ | `39cdc47` | 47 birim + 5 e2e paketi; GitHub Actions (Postgres + `next start` + sahte Stripe) yeşil |
| 6 | ✅ (taslak) | `2077537` | 5 politika sayfası ve gerçekle uyumlu pazarlama metinleri. **Avukat incelemesi gerekli** |

**Kabul ölçütlerinden henüz doğrulanamayanlar** (gerçek hesap gerekiyor): gerçek Stripe test anahtarıyla 3DS kartı
(`4000 0027 6000 3184`) ve gerçek webhook teslimi; EasyPost test anahtarıyla servis seçimi. Kod yolu sahte Stripe
ile uçtan uca test edildi; gerçek anahtarla bir kez elle denenmeli.

**Faz 0'dan kalan, kod dışı:** politika metinlerinin avukat incelemesi; ürün metinlerindeki doğrulanmamış iddiaların
(`NSF`, `cGMP`, satış rakamları — örnek katalog) gerçek bilgiyle değiştirilmesi; NJ vergi sınıflarının mali müşavirle
teyidi (özellikle Paterson UEZ indirimli oranı uygulanabilir mi).

**Canlıya alma (faz-0 → main):**
1. Neon SQL Editor'de `db/migrations/0001_faz0.sql` çalıştırın (mevcut veritabanı için; tekrar çalıştırmak güvenli).
   Not: kayıtlı sertifika numarası olmayan muafiyetler askıya alınır — `/admin/users`'tan sertifika no girerek yeniden açın.
2. Vercel ortam değişkenleri: `CRON_SECRET` (uzun rastgele değer), `STRIPE_WEBHOOK_SECRET`.
3. Stripe → Developers → Webhooks: `https://<alan adı>/api/stripe/webhook`, olaylar
   `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`.
4. `faz-0` dalını `main`'e birleştirin (PR). Vercel Cron (`vercel.json`, günde bir) Pro planda çalışır.
5. Onaylı bir test hesabıyla Stripe test modunda bir sipariş verin; `/admin/orders`'ta ödeme durumu "paid" olmalı.

### Faz 1 — Gerçek B2B operasyonu (Hafta 4–8, ≈24 g)

| Kalemler | Efor |
|---|---|
| **Ürün verisi:** URN-1 (ASIN, Amazon URL, UPC/GTIN, MAP, maliyet, lojistik, uyum alanları), URN-2, URN-4, URN-6 — ayrıca SKU/UPC/ASIN araması ve uyum paneli (bkz. `REFERANS-SITELER.md` #7, #8) | 7 g |
| **Stok:** STK-1, STK-2, STK-3 (lot/SKT/FEFO), STK-4 | 8,5 g |
| **Sipariş yönetimi:** ODE-4 (durum makinesi, iptal/iade), ODE-5, ODE-7 | 5 g |
| **Vergi doğruluğu:** VRG-6, VRG-7 (VRG-5 Faz 0'da yapıldı) | 3,5 g |
| **Admin güvenliği:** KYT-4 (audit log, 2FA, roller) | 3 g |

**Kabul:** Ürün ASIN/UPC ile kaydedilir, geçersiz GTIN reddedilir, Amazon bağlantısı ASIN'den oluşur; her stok
değişikliğinin defter kaydı vardır; sipariş en yakın SKT'li lottan düşer ve lot sipariş kalemine yazılır; iptal
stoğu ve parayı iade eder; gıda NJ'de vergisiz hesaplanır; her admin işlemi audit log'da görünür.

#### Faz 1 durumu (19 Ekim 2026, `faz-1` dalı)

| Kalem | Durum | Commit | Not |
|---|---|---|---|
| KYT-4 | ✅ | `c4d1334` | Roller: Sahip / Operasyon / Satış / Muhasebe / Salt okunur (`src/lib/staff.ts`); personel için TOTP 2FA zorunlu (canlıda), 10 kurtarma kodu, kod tekrar kullanılamaz, 5 hatalı denemede parola yeniden istenir; rol değişikliği sahibin parolasını ister, hedefin oturumlarını kapatır ve e-posta atar; doğrulanmamış hesap personel olamaz; salt-ekleme `audit_log` + `/admin/audit` |
| URN-1, URN-2, URN-4, URN-6 | ✅ | `e0a41ab` | GTIN (GS1 kontrol hanesi, benzersiz), koli GTIN, ASIN (Amazon bağlantısı türetilir, yalnızca onaylı alıcıya), MPN, üretici, tedarikçi, maliyet (yalnız personel), MAP, palet/navlun sınıfı, hazmat/UN, HTS, ISO menşe, raf ömrü, içerik, FALCPA alerjen, Facts paneli, DSHEA uyarısı, Prop 65 (CA'ya giden siparişte ödeme öncesi de), belgeli sertifika, SEO; içe aktarma form doğrulamasıyla ve hep-ya-hiç; iyimser kilit; UPC/ASIN/MPN araması ve hızlı siparişte barkod eşleşmesi |
| STK-1, STK-2, STK-3 | ✅ | `e0a41ab` | `product_lots` + `inventory_movements`; stok yalnızca lot üzerinden ve fark olarak değişir; FEFO tahsis sipariş kalemine yazılır (`order_item_lots`); SKT'ye 60 gün kalan lot satıştan otomatik çekilir; bekletme / serbest bırakma / geri çağırma; lot no ile geri çağırma sorgusu |
| STK-4 | 🟡 kısmi | `e0a41ab` | Ürün başı yeniden sipariş noktası + günlük düşük stok e-postası; yanıltıcı rezervasyon metni yok. **Ön sipariş (backorder) yapılmadı** — kısmi tahsis ve sonradan gelen lotla tamamlama gerektiriyor; Faz 2'ye taşındı |
| ODE-4, ODE-7 | ✅ | `275403a` | İzinli durum geçişleri, ödeme kapanmadan sevk yok, takip/PRO no zorunlu; `order_events` geçmişi; ayrı admin notu; iptalde stok lotlara döner ve kart Stripe'tan iade edilir (başarısızsa yeniden deneme); 14 gün RMA, açılmış/hasarlı ve tüm gıda/takviye iadeleri satışa dönmez (karantina/imha); iade tutarı satır net fiyatı + vergisiyle orantılı; satır bazında indirim, matrah ve vergi saklanır |
| ODE-5 | ✅ | Faz 0 + `275403a` | Misafir ödemesi yok (karar 7); 7 günde ödenmeyen ACH iptal + `void` |
| VRG-6 | ✅ (kapsam dışı) | `275403a` | Tek eyalet (NJ) için TaxJar gereksiz; çağrı ve anahtar kaldırıldı. Yeni eyalette kayıt olunursa yeniden değerlendirilir |
| VRG-7 | ✅ | `275403a` | Siparişte vergi kaynağı, matrah, kargo vergisi, sertifika no; `/admin/reports/tax` aylık NJ rakamları + diğer eyaletler için ekonomik nexus izleme, CSV |
| Testler / CI | ✅ | `275403a` | 67 birim testi; 6. e2e paketi `faz1` (93 kontrol); CI `main` şeması + migration = `db/schema.sql` kontrolü |

**Faz 1'de yapılmayanlar (bilerek):** kategori tablosu ve varyantlar (URN-1 "Katalog" satırı, +3 g), ayrı tedarikçi
tablosu (şimdilik ürün üzerinde metin), ön sipariş (STK-4), TOTP gizli anahtarının şifrelenmesi (veritabanı okuma
yetkisi tek başına giriş sağlamaz çünkü parola da gerekir; ayrı bir anahtar yönetimiyle Faz 3'te).

**Canlıya alma (faz-1 → main):**
1. PR'ı açın; CI yeşil olmalı (migration kontrolü dahil).
2. Neon SQL Editor'de `db/migrations/0002_faz1.sql` çalıştırın ve **hemen ardından** PR'ı birleştirin.
3. İlk girişte admin hesabınızda 2FA kurun (DEPLOYMENT.md §3.3) ve kurtarma kodlarını saklayın.
4. `/admin/inventory`'de gıda/takviye `…-OPENING` lotlarına best-by tarihlerini girin ("Best-by missing").
5. İsteğe bağlı Vercel değişkeni: `OPS_EMAIL` (düşük stok ve iade talebi bildirimleri; boşsa mağaza e-postası).

### Faz 2 — Kargo, sepet deneyimi, performans (Hafta 9–13, ≈23 g)

| Kalemler | Efor |
|---|---|
| **Kargo:** KRG-2, KRG-3, KRG-4, KRG-5, KRG-6, KRG-7, KRG-8 | 10,5 g |
| **Sepet ve kupon:** SEP-3, SEP-6, SEP-7 | 6 g |
| **Performans:** PRF-1…PRF-4 | 4,5 g |
| **Dağıtım:** DEV-2, DEV-3, DEV-4, DEV-5 | 3 g |

**Kabul:** Çok kolili ve paletli sipariş için teklif edilen ve faturalanan kargo farkı < %5; PO Box'a LTL
reddedilir; katalog sayfaları önbellekten gelir (TTFB < 300 ms); migration'lar CI'dan uygulanır; hata alarmları çalışır.

#### Faz 2 durumu (20 Ekim 2026, `faz-2-sepet-kupon` dalı)

| Kalem | Durum | Not |
|---|---|---|
| SEP-3 | ✅ | Sepet yalnızca `{productId, cases}` saklar (v1 sepetleri taşınır); çekmece, ödeme özeti ve tekrar sipariş `/api/cart` → `cartView()`'dan çizilir, fiyat `priceCart()`'tan gelir. Çıkış yapan kullanıcıya fiyat dönmez, katalog/sözleşme fiyatı değişirse anında yansır |
| SEP-6 | ✅ | `coupons`'a başlangıç/bitiş, toplam ve müşteri başı kullanım limiti, `allowed_tiers`, `stackable`, `redeemed_count`; `coupon_redemptions` tablosu; kurallar tek yerde (`couponProblem()`, 12 birim testi); kullanım sipariş transaction'ında kupon satırı kilitlenerek sayılır; kargo kuponu yalnızca ground servisi sıfırlar; `/admin/coupons` ekranı (`accounts` izni, audit kaydı) |
| KRG-1 | ✅ (Faz 0) | Kararlı kargo seçenek ID'si |
| PRF-4 | ✅ (Faz 0) | `CardProduct` dar tipi |
| DEV-4 | ✅ (Faz 1) | Günlük `maintenance` cron'u |
| KRG-4 | ✅ | Ücretsiz kargo tek yerde (`applyFreightAllowance`), canlı EasyPost fiyatlarında da geçerli; yalnızca ground parsel, zone 1–6, palet hariç; eşik ve kapsam `SITE`'tan okunur, başlık/toptan/politika metinleri kapsamı yazar |
| KRG-6 | ✅ | Koli ağırlığı ons olarak saklanır (`weight_oz`, migration 0005), arayüz pound; faturalanan ağırlık koli başına `max(gerçek, boyutsal)` + paketleme — tek seferlik paketleme ve "0,6 lb → 1 lb" yuvarlaması bitti |
| KRG-7 | ✅ | `hazmat` ürün sepetteyse hava servisi hiç listelenmez (matris ve EasyPost); politika metninde de yazıyor |
| KRG-8 | ✅ | Uydurma taahhütler kalktı: matris fiyatları ve transit süreleri "estimate", LTL satırı gerçek taşıyıcı adı taşımıyor ve class/NMFC'nin booking'de doğrulanacağını söylüyor |
| KRG-3 | 🟡 kısmi | Yanıltıcı "Ciputra Freight (LTL) · class 100" etiketi dürüstleştirildi; gerçek LTL fiyatı (freight_class/NMFC/palet alanları, ek hizmetler) taşıyıcı hesabı gelince |
| KRG-2, KRG-5 (adres doğrulama) | ⏸ Ertelendi | Gerçek parsel/LTL hesabı (EasyPost, LTL aracısı) yok; koli başına parcel gönderimi ve adres doğrulama hesap açılınca |
| PRF-2 | ✅ | Fontlar `next/font` ile self-host (Google'a istek yok, render engellemiyor, lint uyarısı kalktı); katalog/sepet/ödeme görselleri `next/image` (AVIF/WebP, boyutlandırma). Admin önizlemeleri ve değişken oranlı Facts paneli bilinçli olarak `<img>` kaldı |
| PRF-3 | ✅ | Eksik indeksler (migration 0007): doğrulama/sıfırlama jetonu, `orders.email`, `orders.created_at`, `products(active, featured)`, `sessions.expires_at`, `rate_limits.reset_at`. Ürün sayfasındaki çift sorgu ve istek başına tekrarlanan oturum sorgusu React `cache()` ile teke indi |
| DEV-5 | ✅ | CSP eklendi: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`; Stripe ve görsel kaynakları açıkça izinli. Script'lerde `'unsafe-inline'` kaldı (nonce için middleware gerekir — Faz 3) |
| PRF-1 | 🟡 kısmi | İstek başına oturum sorgusu teke indi. Sayfa önbelleği **yapılmadı**: katalog HTML'i fiyat kilidine göre değişiyor, dolayısıyla paylaşımlı önbellek misafire toptan fiyat sızdırabilir. Doğru çözüm PPR/`cacheComponents` ile kilitli ve kilitsiz varyantı ayırmak — ayrı bir iş olarak planlanmalı |
| SEP-7 | ✅ | `carts`/`cart_items` (migration 0008): girişli alıcının sepeti cihazlar arası taşınır, girişte yerel sepetle birleşir (satır başına büyük adet), sipariş verilince boşalır; 3 gün bekleyen sepete cron'dan tek hatırlatma e-postası. Misafir sepeti yine yalnızca localStorage'da. Tekrar sipariş zaten vardı |
| DEV-2 | ✅ | `npm run db:migrate` koşucusu: `schema_migrations` defteri, sıra, checksum uyarısı, `--status` ve mevcut veritabanını devralmak için `--baseline`. Elle SQL yapıştırma bitti; CI koşucuyu temiz şema üzerinde doğruluyor |
| DEV-3 | ✅ (vendor'sız) | `alertOps()` tek satır JSON log + 15 dakikada bir operasyona e-posta (webhook, kart capture, sipariş yazma, cron); `instrumentation.ts` → `onRequestError`; `/api/health` veritabanı düşünce 503. Sentry gibi bir servis isteniyorsa üzerine eklenebilir |

### Faz 3 — Büyüme ve olgunluk (Hafta 14–18, ≈25 g)

| Kalemler | Efor |
|---|---|
| ODE-6 Net-30: kredi limiti, fatura PDF'i, yaşlandırma (AR aging), geciken hesap dondurma | 4 g |
| KYT-10, KYT-6, KYT-8, KYT-9, KYT-11 (belge yükleme dahil) | 5 g |
| UX-3 erişilebilirlik (WCAG 2.1 AA), UX-4, UX-5, UX-6 | 4,5 g |
| UX-7: fiyatı yalnızca onaylı hesaplara gösterme, hesap başı fiyat listesi, çok kullanıcılı firma hesabı, RFQ | 8 g |
| DEV-1 tamamlama (Playwright e2e), DEV-6, DEV-8 | 3 g |
| İsteğe bağlı: Amazon SP-API ile ASIN'den fiyat/stok senkronu, QuickBooks entegrasyonu | ayrıca |

**Toplam:** ≈90 iş günü (≈19 hafta, 1 geliştirici).

---

## 4. İşletme kararları (19 Ekim 2026'da verildi)

| # | Karar | Plana etkisi |
|---|---|---|
| 1 | **Vergi kaydı yalnızca New Jersey.** | VRG-1: `NEXUS_STATES = ["NJ"]`, diğer eyaletlerde satış vergisi 0. VRG-2: NJ %6,625 sabit, uydurma tablo kaldırılır. VRG-4: muafiyet yalnızca NJ'ye gönderimde ve geçerli NJ ST-3 / ST-3NR veya NJ'nin kabul ettiği MTC/SST sertifikasıyla. VRG-6 (TaxJar) önceliği düşer. Diğer eyaletlerin ekonomik nexus eşikleri raporla izlenir. |
| 2 | **$150 zorunlu asgari sipariş.** | SEP-2: teklif ve siparişte $150 altı reddedilir. |
| 3 | **Yalnızca 48 bitişik eyalet + DC.** | KRG-5: AK, HI, PR, bölgeler ve APO/FPO/DPO reddedilir. Faz 0'a alındı. |
| 4 | **Kart + ACH + Net-30; misafir ACH serbest.** | ODE-5: misafir ACH kalır; ödenmeyen sipariş 7 gün sonra otomatik iptal + stok iadesi (Cron), sipariş başı tutar üst sınırı. ODE-6 Net-30 Faz 3'te. |
| 5 | **ASIN yalnızca referans; Amazon'da satış yok.** | URN-1: `asin` + ASIN'den türetilen `amazon_url` (karşılaştırma bağlantısı). SP-API senkronu kapsam dışı. MAP alanı bilgi amaçlı. |
| 6 | **Kendi depo; lot/SKT takibi depoda.** | STK-3 (lot, SKT, FEFO) Faz 1'de; sevk edilen lot sipariş kalemine yazılır. |
| 7 | **Toptan fiyatlar herkese açık değil.** | UX-7'nin "fiyat kilidi" kısmı **Faz 0'a** alındı: fiyat, sepet ve hızlı sipariş yalnızca yetkili hesaplara; JSON-LD'den fiyat kaldırılır; misafire "fiyatları görmek için giriş yapın / başvurun". |
| 8 | **Açılmış takviye/gıda dahil 14 gün iade.** | UX-1 iade politikası metni buna göre; ODE-4 iade (RMA) akışı Faz 1'de: 14 gün sınırı, lot kaydı, iade edilen açılmış ürün satılabilir stoğa dönmez (karantina/imha). |

## 5. Kod dışı paralel işler

`B2B_ROADMAP.md` §6'daki liste geçerli: ekonomik nexus analizi ve eyalet kayıtları, takviye etiket/iddia
incelemesi (FDA yapı/işlev iddiaları, cGMP tedarikçi belgesi), Prop 65, ürün sorumluluk sigortası, geri çağırma
planı, yasal metinler, Stripe hesap aktivasyonu ve Resend alan adı doğrulaması. Bunlar haftalar sürdüğü için
Faz 0 ile **aynı gün** başlatılmalı.

## 6. Bu incelemenin kapsamadığı şeyler

- Gerçek anahtarlarla Stripe/TaxJar/EasyPost/Resend çalıştırılmadı; bulgular kod okumasına dayanır.
- Tarayıcıda görsel test, yük testi ve sızma testi yapılmadı.
- Vergi ve hukuk maddeleri yönlendirme düzeyindedir; kesin karar için mali müşavir ve avukat gerekir.
