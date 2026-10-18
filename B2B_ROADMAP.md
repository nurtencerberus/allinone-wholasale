# Meridian Supply Co. — B2B İnceleme ve İş Planı

**Kapsam:** Mevcut kod tabanının ve çalışan önizlemenin, ABD pazarına toptan satış yapan bir B2B e-ticaret operasyonu gözüyle incelenmesi.
**Yöntem:** Kodda hedefli aramalar + canlı önizlemede uçtan uca denemeler + `npm audit`. Hiçbir kod değiştirilmedi.

---

## 0. Yönetici özeti

**Karar: Güçlü bir MVP/demo. Canlıda gerçek müşteriden para almaya hazır değil.**

Katalog, kademeli fiyat, boyutsal kargo, vergi muafiyeti, XLS/CSV sipariş, admin paneli ve SEO altyapısı çalışıyor. Ancak:

1. **Canlı sistemde doğrudan kötüye kullanılabilen 5 sorun var** (herkesin başkasının siparişini okuyabilmesi, admin parolasının giriş sayfasında yazması, stoktan fazla sipariş, yanlış vergi muafiyeti, giriş denemesi sınırı olmaması).
2. **B2B'yi B2B yapan özelliklerin çoğu yalnızca metin olarak var.** Sitede "Net 30" yazıyor ama kodda vade, kredi limiti, fatura veya PO numarası yok.
3. **Sitedeki bazı iddialar gerçek değil.** Bunları ben örnek veri olarak koymuştum; canlıya çıkmadan kaldırılmalı (bkz. P0-8).
4. **Gerçek entegrasyonların hiçbiri gerçek anahtarla çalıştırılmadı.** Stripe, TaxJar, EasyPost ve Resend yalnızca "anahtar yok" yedek modunda denendi.

**Önerilen sıra:** Faz 0 (≈2 hafta) bitmeden gerçek müşteri almayın. Vergi kaydı ve hukuki işler uzun sürdüğü için **ilk gün paralel başlatın** (bkz. §6).

### Durum tablosu

| Alan | Durum | Not |
|---|---|---|
| Katalog, ürün sayfası, SEO, JSON-LD | ✅ Sağlam | Yeni ürün ve arşiv akışı test edildi |
| Sepet, 3 adımlı checkout (demo modu) | ✅ Çalışıyor | Gerçek Stripe akışı denenmedi |
| Kademeli fiyat, hesap iskontosu | ✅ Çalışıyor | Yalnızca genel %; müşteriye özel fiyat yok |
| XLS/CSV sipariş, hızlı sipariş, tedarikçi listeleri | ✅ Güçlü | Herkese açık yükleme ucu riskli (P0-7) |
| Boyutsal kargo, LTL | ⚠️ Simülasyon | Kendi matrisimiz; LTL fiyatı uydurma formül |
| Satış vergisi | ❌ Riskli | Yedek tablo gerçek değil; muafiyet eyalete bakmıyor |
| Başvuru → onay → hesap | ⚠️ Eksik | Onay hesap açmıyor, belge yüklenmiyor |
| Vade (Net 30), kredi, fatura, PO | ❌ Yok | Yalnızca metin |
| Sipariş yönetimi (iade, kısmi sevkiyat) | ❌ Yok | Sadece durum + takip no |
| Güvenlik | ❌ Açıklar var | Bkz. P0 |
| Yasal sayfalar, uyumluluk | ❌ Yok | Şartlar, gizlilik, iade, FDA uyarısı yok |

### Bulguların doğrulama düzeyi

- **[T]** Canlı önizlemede denendi, sonuç aşağıda.
- **[K]** Kodda doğrulandı, çalıştırılmadı.
- **[U]** Uzman değerlendirmesi; test edilemez.

---

## 1. P0 — Canlıya çıkmadan önce kapatılması gerekenler

| # | Bulgu | Kanıt | Etki | Çözüm | Efor |
|---|---|---|---|---|---|
| **P0-1** | **Herkes başkasının siparişini görebiliyor.** `/order/<no>` oturum kontrolü yapmıyor. | **[T]** Misafir olarak `GET /order/MSC-1042` → 200; alıcı e-postası, adı, adresi, şirketi ve takip numarası görünüyor. Sipariş numaraları sıralı veya zamandan türetilmiş. | Müşteri verisi sızıntısı (KVKK/CCPA riski) | Sayfayı yalnızca sipariş sahibine ve admine aç; misafir için imzalı, tahmin edilemez bağlantı. Sipariş numarasını rastgele üret. | 0,5 g |
| **P0-2** | **Admin dahil demo parolalar giriş sayfasında herkese yazıyor.** | **[T]** `/login` kaynağında `Admin123!`, `Trade123!`, `Customer123!` var; tek tıkla admin girişi. | Varsayılanlarla yayına çıkan sistem anında ele geçirilir | Demo bloğunu üretimde gizle; tohum parolalarını kaldır/rastgele yap. | 0,25 g |
| **P0-3** | **Stoktan fazla sipariş alınıyor.** Sunucu stok, MOQ ve asgari sipariş tutarını denetlemiyor. | **[T]** Stoğu 7 olan SKU için 500 koli teklifi kabul edildi ($89.151). **[K]** Stok düşümü `greatest(0, …)` ile sıfıra kırpılıyor, fazlalık sessizce kayboluyor. `minOrderValue` ve `minCases` yalnızca mesaj/arayüz. | Satılamayan ürüne tahsilat, iptal ve itibar kaybı | Fiyatlama ve sipariş aşamasında stok/MOQ/asgari tutarı zorunlu kıl; stok düşümünü işlemde `stock >= n` koşuluyla yap. | 1 g |
| **P0-4** | **Vergi muafiyeti eyalete bakmıyor.** Maine için muaf hesap Teksas'a gönderince de vergi 0. | **[T]** Aynı alıcı: ME → muaf, TX → muaf. **[K]** `taxExemptState` kaydediliyor ama hesaplamada kullanılmıyor; sertifika süresi yok. | Eksik vergi tahsilatı; denetimde şirket sorumlu | Muafiyeti sertifikanın eyaletine ve geçerlilik tarihine bağla; sertifikasız muafiyeti reddet. | 1 g |
| **P0-5** | **Giriş denemesi sınırı yok.** | **[T]** 15 yanlış parola ardışık denendi (hepsi 401), sonra doğru parola 200 döndü. Rate limit/kilit/CAPTCHA hiçbir uçta yok. | Parola deneme saldırısı, kart deneme (payment-intent herkese açık), spam başvuru | Giriş, kayıt, şifre sıfırlama, payment-intent, başvuru ve import uçlarına hız sınırı + geçici kilit. | 1,5 g |
| **P0-6** | **Ödeme bütünlüğü zayıf.** Webhook yok, aynı ödeme birden fazla siparişe çevrilebilir. | **[K]** Sipariş, tarayıcı `POST /api/orders` çağırınca oluşuyor. Sekme ödeme sonrası kapanırsa **tahsilat var, sipariş yok**. `payment_ref` benzersiz değil, PaymentIntent'e idempotency anahtarı verilmiyor. Sipariş no `Date.now()` son 6 hanesi (çakışırsa ödeme sonrası 500). | Çift sipariş, kayıp sipariş, mutabakat sorunu | Stripe webhook (`payment_intent.succeeded`) ile siparişi sunucuda oluştur/doğrula; `payment_ref` benzersiz; idempotency anahtarı; sıralı sipariş numarası. | 2 g |
| **P0-7** | **Güvenlik açığı olan bağımlılık, kimliksiz erişimli uçta.** | **[T]** `/api/order-sheet/import` girişsiz 200 veriyor ve dosyayı `xlsx 0.18.5` ile ayrıştırıyor. **[T]** `npm audit`: `xlsx` 2 yüksek (prototype pollution, ReDoS), npm'de düzeltilmiş sürüm yok. `next` için **kritik** uyarı, toplam 23 (1 kritik, 13 yüksek). | Sunucuya hazırlanmış dosyayla saldırı; hizmet kesintisi | `xlsx`'i bakımı yapılan sürüme taşı veya başka okuyucu kullan; import ucunu giriş/limit arkasına al; `next`'i yamalı sürüme yükselt (hangi uyarının geçerli olduğu ayrıca doğrulanmalı). | 1 g |
| **P0-8** | **Sitede gerçek olmayan iddialar var** (örnek veri olarak benim koyduğum). | **[K]** "1.400+ hesap", "%98,6 stok karşılama", "1.412 doğrulanmış yorum", NSF / IFOS sertifika rozetleri, 17 uydurma "doğrulanmış alıcı" yorumu, 3 uydurma referans, alt bilgide uydurma adres ve EIN (`84-2210977`). | **ABD'de yanıltıcı reklam (FTC)**, sertifika iddiası hukuki risk. Yorumlar JSON-LD'ye de gidiyor (Google'dan ceza riski). | Gerçek olmayan her şeyi kaldır veya "örnek" etiketle; gerçek adres/EIN ekle; yalnızca gerçek teslim edilmiş siparişten yorum al. | 1 g + işletme girdisi |
| **P0-9** | **Yasal sayfa yok.** | **[K]** Satış Şartları, Gizlilik, İade, Kargo, Çerez ve FDA uyarısı sayfaları ve alt bilgi bağlantıları yok. Ürün JSON-LD'si "30 gün ücretsiz iade" taahhüdünü Google'a yazıyor. | Hukuki boşluk; ödeme sağlayıcı hesap incelemesinde ret riski | Sayfaları hukukçuyla hazırla; iade taahhüdünü gerçek politikayla eşle. | 1 g + hukuk |

**Faz 0 kabul ölçütleri (hepsi test edilebilir):**
- Misafir `/order/<başka sipariş>` → 404; sahibi ve admin → 200.
- Üretim `/login` sayfasında hiçbir parola yok.
- Stoktan fazla veya MOQ altı sepet, hem teklifte hem siparişte reddedilir; eşzamanlı iki sipariş stoğu eksiye düşürmez.
- ME muaf alıcı TX'e gönderince vergi hesaplanır; sertifika süresi geçince vergi hesaplanır.
- 10. yanlış denemede 429; doğru parola kilit süresince kabul edilmez.
- Ödeme sonrası sekmeyi kapatma testi: sipariş yine oluşur. Aynı `pi_…` ikinci kez siparişe dönüşmez.
- `npm audit` yüksek/kritik: 0 (veya yazılı kabul edilmiş istisna).

---

## 2. P1 — Gerçek B2B olmanın şartları

| # | Eksik | Neden önemli | Efor |
|---|---|---|---|
| **P1-1** | **Onay hesap açmıyor.** 3 başvurudan yalnızca 1'i hesaba bağlı; onay e-postası "giriş yapın" diyor ama hesap yok. | **[T]** Onaylanan alıcı siteye giremez. Onayla birlikte davet + şifre belirleme bağlantısı gönder, başvuruları e-postaya göre birleştir. | 1,5 g |
| **P1-2** | **Belge yüklemesi yok.** Resale certificate, W-9 alınmıyor; EIN yalnızca biçim kontrolünden geçiyor, "doğrulandı" kutusu elle işaretleniyor. | Vergi muafiyetinin denetimdeki tek dayanağı sertifikadır. Eyalet bazlı sertifika + son kullanma tarihi + yenileme hatırlatması + dosya depolama (S3/R2) gerekir. | 3 g |
| **P1-3** | **Gerçek işletme doğrulaması yok.** | EIN/işletme eşleştirme için üçüncü taraf doğrulama sağlayıcısı entegre edin (maliyetli, ama sahte başvuruyu eler). | 2 g |
| **P1-4** | **Vade (Net 30), kredi limiti, fatura, tahsilat yok.** Sitede "Net 30 sonrası onaylı hesaplar" yazıyor; kodda 0 satır. | Toptan satışın büyük bölümü vadeli satıştır. Gerekenler: kredi başvurusu + ticari referanslar, hesap başına limit ve vade, fatura (PDF), ACH/çek ödemesi, yaşlandırma raporu (AR aging), gecikmede sipariş durdurma. Stripe Invoicing ile başlanabilir. | 9 g |
| **P1-5** | **PO numarası ve maliyet merkezi yok.** | Kurumsal alıcılar PO'suz sipariş veremez; fatura ve onay e-postasında yer almalı. | 1 g |
| **P1-6** | **Koli/palet kuralları yok.** Koli çarpanı (örn. 6'şar), palet adedi, SKU başına kargo sınıfı (freight class/NMFC), tehlikeli madde işareti modellenmemiş. | LTL fiyatı doğru olmak zorunda; yanlış sınıf, fatura düzeltmesi demektir. | 2 g |
| **P1-7** | **Fiyat herkese açık.** | Rakipler ve alıcılar maliyetlerinizi görür. "Fiyatı yalnızca onaylı hesaplara göster" seçeneği ekleyin (SEO ile dengeli: ürün sayfası açık, fiyat kilitli). | 1 g |
| **P1-8** | **Gerçek kargo entegrasyonu yok.** | **[K]** Yedek mod kendi formülümüz; LTL maliyeti `11.500 + bölge×900 + lbs×20` benzeri **uydurma**. EasyPost yolu tek koli gönderiyor (çok koli/palet yok), adres doğrulama, konut/ticari ayrımı, liftgate yok. Gerçek LTL için bir yük API'si gerekir. Gerçek kargo ücretinden düşük teklif doğrudan zarardır. | 6–8 g |

---

## 3. P2 — Operasyon ve olgunluk

| # | Eksik | Not | Efor |
|---|---|---|---|
| P2-1 | **Admin sipariş detay sayfası yok.** | **[K]** `/admin/orders` yalnızca tablo. Kalemler, adres, ödeme, not, zaman çizgisi, paketleme fişi/toplama listesi yazdırma gerekli. | 2 g |
| P2-2 | **İptal, iade, kısmi iade, RMA yok.** | "Cancelled" yalnızca etiket: Stripe'a iade gitmiyor, stok geri gelmiyor. | 4 g |
| P2-3 | **Kısmi sevkiyat, ön sipariş (backorder), çoklu takip no yok.** | Palet siparişlerinde sık gerekir. | 3 g |
| P2-4 | **Admine bildirim yok.** | **[K]** Yeni sipariş, başvuru, düşük stok, başarısız ödeme için e-posta/Slack bildirimi yok. Başvuru kuyruğu fark edilmeden bekler. | 1 g |
| P2-5 | **Müşteriye özel fiyat yok.** | Yalnızca hesap başı tek yüzde. SKU bazlı sözleşmeli fiyat, geçerlilik tarihi, fiyat listesi şablonları gerekir. | 4 g |
| P2-6 | **Yeniden sipariş yok.** | Sipariş geçmişinden "tekrar sipariş", kayıtlı listeler, şablonlar. B2B'de tekrar sipariş ana gelirdir. | 2 g |
| P2-7 | **Çok kullanıcılı firma hesabı yok.** | Satın alan / onaylayan / muhasebe rolleri, harcama limiti. Bir firma = bir kullanıcı şu an. | 5 g |
| P2-8 | **Parti/son kullanma takibi yok.** | Supplement ve gıdada FEFO, parti no, geri çağırma (recall) için şart. Stok rezervasyonu da yok. | 6 g |
| P2-9 | **Raporlama ve denetim izi yok.** | Satış (SKU/müşteri), marj, **eyalete göre toplanan vergi (beyanname için)**, AR, sipariş CSV dışa aktarımı, admin işlem günlüğü. | 3 g |
| P2-10 | **Admin güvenliği:** 2FA, roller (operasyon/satış/salt okunur), admin oluşturma akışı yok (şu an SQL). | | 3 g |
| P2-11 | **Oturum/sıfırlama jetonları veritabanında düz metin.** | **[K]** Veritabanına okuma erişimi hesap ele geçirmeye yeter. Jetonları hash'leyerek sakla. | 0,5 g |
| P2-12 | **Ürün karton ağırlığı tamsayı lb.** | 0,85 lb girilemiyor; küçük ürünlerde kargo hatası. Ondalığa çevrilmeli (şema değişikliği). | 0,5 g |

---

## 4. P3 — Ölçek ve büyüme

| # | Madde | Efor |
|---|---|---|
| P3-1 | Gerçek yorum akışı: teslim edilmiş siparişten davet, moderasyon, "doğrulanmış alıcı" etiketi yalnızca gerçekse | 2 g |
| P3-2 | Teklif (RFQ) akışı: büyük/LTL siparişler için teklif PDF'i, hesap yöneticisi atama | 4 g |
| P3-3 | Muhasebe/ERP: QuickBooks Online senkronu; büyük perakendeciler için sonra EDI (850/810) | 5 g+ |
| P3-4 | Görselleri veritabanından nesne depolamaya (S3/R2) + CDN, `next/image` | 2 g |
| P3-5 | Gözlemlenebilirlik: Sentry, uptime, veritabanı yedek/PITR, yapılandırılmış log. Tohumlamayı istek yolundan çıkar; `drizzle-kit push` yerine sürümlü migration | 2 g |
| P3-6 | Performans: kök layout çerez okuduğu için tüm sayfalar dinamik; katalog önbelleği | 2 g |
| P3-7 | SEO içeriği: kategori açılış sayfaları, kaynak içerikleri | süreklilik |

---

## 5. Uygulama planı

> **Varsayım:** 1 tam zamanlı full-stack geliştirici. Süreler kaba tahmindir (**±%40**). İki geliştirici ile takvim yaklaşık yarıya iner, ama Faz 0 sıralı kalır.

| Faz | Hafta | İçerik | Efor | Çıkış koşulu |
|---|---|---|---|---|
| **Faz 0 — Güvenli ve dürüst** | 1–2 | P0-1…P0-9 | ≈10 g | Kabul ölçütlerinin tamamı geçer; gerçek anahtarlarla (Stripe test modu, TaxJar, EasyPost, Resend) uçtan uca deneme yapılır |
| **Faz 1 — Gerçek B2B** | 3–6 | P1-1…P1-7 (+ P2-11) | ≈20 g | Onaylı alıcı hesabı açabilir, belge yükler, PO ile vadeli sipariş verir ve fatura alır |
| **Faz 2 — Operasyon** | 7–11 | P1-8, P2-1…P2-6, P2-12 | ≈23 g | Sipariş uçtan uca yönetilir: gerçek kargo, iade, kısmi sevkiyat, bildirim, yeniden sipariş |
| **Faz 3 — Ölçek** | 12–16 | P2-7…P2-10, P3 | ≈27 g | Çok kullanıcılı hesap, parti takibi, raporlar, 2FA, ERP |
| **Toplam** | ≈16 hafta | | ≈80 iş günü | |

**Önemli bağımlılıklar:**
- Faz 0'daki vergi işi (P0-4) için **işletme tarafında nexus analizi ve eyalet kaydı bitmeden** gerçek vergi tahsil edilmemeli. Bu haftalar sürer.
- Faz 1'deki vade (P1-4), hukuki kredi politikası kararına bağlı.
- Faz 2'deki gerçek LTL (P1-8) için taşıyıcı/aracı sözleşmesi gerekir.

---

## 6. Kod dışı paralel iş kolu (ilk gün başlayın)

> Bunlar hukuk/mali müşavir doğrulaması gerektirir; aşağıdakiler başlık düzeyinde yönlendirmedir, hukuki tavsiye değildir.

| Konu | Yapılacak |
|---|---|
| **Satış vergisi** | Ekonomik nexus analizi, vergi kaydı yapılacak eyaletler, kim beyan verecek (Stripe Tax/TaxJar + mali müşavir). Yeniden satış sertifikası yönetimi (çok eyaletli sertifika kabulü). |
| **Vitamin/supplement** | Etiket ve beyan incelemesi (yapı/işlev iddiaları, FDA uyarı metni), tedarikçinin cGMP durumunun doğrulanması, Prop 65 uyarıları, ürün sorumluluk sigortası, geri çağırma planı. Sitedeki "NSF/IFOS" iddiaları **yalnızca elinizde belge varsa** kullanılmalı. |
| **Gıda** | FDA tesis kaydı, **ABD dışından ithalatta** FSVP ve ithalat ön bildirimi, alerjen ve son kullanma etiketleme, gümrük müşaviri, menşe işaretleme. |
| **Ev dekorasyonu** | Ürün grubuna özgü etiket/güvenlik uyumu (örn. mumlar için uyarı etiketleri). |
| **Sözleşmeler** | Toptan satış sözleşmesi, kredi politikası, iade politikası (açılmış supplement iadesi genelde yok), kargo hasar talepleri, MAP (asgari ilan fiyatı) politikası. |
| **Sigorta** | Ürün sorumluluğu, kargo, siber. |
| **Tedarikçi süreci** | Fiyat listesi güncelleme periyodu (listeler `/admin/lists` ve `/admin/catalog` ile yüklenir), stok teyidi, termin garantisi. |

---

## 7. Sizden gereken kararlar

1. **Vade:** Net 30 sunulacak mı? Kredi limiti ve gecikme politikası ne olacak? (P1-4'ü belirler.)
2. **Fiyat görünürlüğü:** Fiyatlar herkese açık mı, yalnızca onaylı hesaplara mı? (P1-7)
3. **Satış bölgesi:** 48 eyalet mi, belirli eyaletler mi? Alaska/Hawaii kargosu? (vergi + kargo)
4. **Stok modeli:** Kendi depo stoğu mu, tedarikçiden doğrudan sevkiyat (dropship) mi? (P2-8, P2-3)
5. **Asgari sipariş:** Şu an $150 yazıyor; gerçek rakam ve kargo muafiyeti eşiği?
6. **İade politikası:** Hangi ürünlerde, kaç gün? (P0-9)
7. **Ödeme yöntemleri:** Yalnızca kart mı, ACH ve çek de mi?
8. **Hukuki yapı:** ABD'de şirket (LLC/Inc), EIN, depo adresi — şu an hepsi **örnek**.

---

## 8. Başarı ölçütleri (KPI)

| Ölçüt | Neden |
|---|---|
| Başvurudan onaya süre, onay oranı | Satış hunisinin başı |
| Onaydan ilk siparişe dönüşüm | Onay veriyor musunuz, satıyor musunuz? |
| 90 günde tekrar sipariş oranı | B2B'nin gerçek geliri |
| Ortalama sipariş tutarı, kademe indirimi kullanan sipariş oranı | Sepet büyüklüğü |
| Teklif edilen / faturalanan kargo farkı | Kargo zararını erken yakalar |
| DSO (tahsilat günü), geciken fatura oranı | Vadeli satışın sağlığı |
| Stok karşılama oranı, iptal oranı | Operasyon kalitesi |
| Başarısız ödeme ve ödeme-sipariş uyuşmazlığı sayısı | Faz 0 sonrası 0 olmalı |

---

## 9. Bu incelemenin kapsamadığı şeyler

- **Gerçek entegrasyonlar:** Stripe Elements, TaxJar, EasyPost ve Resend gerçek anahtarlarla **hiç çalıştırılmadı**. Ödeme akışının canlı yolu kanıtlanmış değil.
- **Tarayıcıda görsel/etkileşim testi yapılmadı:** Sepet, checkout, hızlı sipariş tablosu ve admin formları sunucu tarafında ve API üzerinden test edildi.
- **Yük, erişilebilirlik (WCAG), tarayıcı uyumluluğu ve e-posta teslim edilebilirliği** incelenmedi.
- **Güvenlik incelemesi sızma testi değildir.** Yalnızca yukarıdaki somut denemeler yapıldı.
- `npm audit` çıktısındaki `next` kritik uyarısının projeye uygulanıp uygulanmadığı ayrıca doğrulanmalı.
- Hukuki ve vergi konuları için yalnızca başlık verildi; kesin cevap için uzmana danışılmalı.

---

## 10. İlk adım önerisi

Faz 0'ı bir seferde bitirmek mümkündür ve en yüksek getirili işlerdir. Sıra: **P0-1 → P0-2 → P0-3 → P0-4 → P0-5 → P0-6 → P0-7**, ardından P0-8/P0-9 (işletme girdisiyle). Bunlar kodda yapılabilir; işletme tarafındaki vergi kaydı ve hukuki metinler aynı hafta içinde başlatılmalı.
