# Referans Toptancı Siteleri — Örnek Alınacak Kalıplar

**Tarih:** 19 Ekim 2026 · **Amaç:** ABD'deki iyi B2B toptan satış sitelerinin herkese açık sayfalarından, yardım
merkezlerinden ve yorumlarından kullanıcı deneyimi kalıplarını çıkarmak ve Ciputra'ya uyarlamak.

**Kaynak güvenilirliği:** **[D]** sayfa açılıp doğrulandı · **[A]** resmî sayfanın arama özeti (sayfa açılmadı) ·
**[H]** bellekten, doğrulanmadı. Faire yardım merkezi, Emerson/Fullscript destek sayfaları, Global Industrial ve
DollarDays 403 döndürdüğü için bunlarda arama özetleri kullanıldı.

**Kapsam dışı kalanlar:** Boxed 2023'te iflas edip perakendeyi kapattı [A]; Tundra'nın 2023 civarı kapandığı
düşünülüyor [H]; Natural Partners artık Fullscript'e yönleniyor [A]; KeHE/UNFI bayi portalları giriş arkasında.

---

## 1. Örnek alınacak ilk 15 kalıp

| # | Kalıp | Kaynak | Bizdeki karşılığı | Durum |
|---|---|---|---|---|
| 1 | Fiyat **sunucuda** gizli, fiyat yerine "Giriş yap / Başvur" | Faire [D], Shopify B2B [D] | UX-7 | ✅ Faz 0'da yapıldı |
| 2 | Kısa başvuru formu, 1 iş günü karar, durum sayfası | Faire [A], Fullscript [A] | KYT-1, KYT-11 | ✅ Hesaba bağlı başvuru + durum ekranı · ⏳ belge yükleme Faz 3 |
| 3 | Koli fiyatı, birim fiyat, MSRP ve **marj** tek blokta | Webstaurant [D], Faire [A], DollarDays [A] | ürün kartı / BuyBox | ✅ Var (onaylı hesaplara) |
| 4 | Adet seçici koli katı ve asgari koliyle; sunucuda yeniden doğrulama | Shopify adet kuralları [D] | SEP-1 | ✅ Faz 0 · ⏳ koli katı (`order_multiple`) Faz 1 |
| 5 | $150 asgari tutar **ilerleme çubuğu**, altında ödeme kapalı | Costco, Fullscript eşikleri [A] | SEP-2, SEP-3 | ✅ Sunucu kuralı · ⏳ sepet çekmecesinde canlı çubuk Faz 2 |
| 6 | Sepette ZIP ile kargo tahmini; 48 eyalet dışı açık mesajla red | Webstaurant [D] | KRG-5 | ✅ Kural · ⏳ sepette tahmin Faz 2 |
| 7 | SKU, UPC ve ASIN ile arama; tam eşleşme doğrudan ürüne | Uline [D], BigCommerce [D] | URN-1, UX-6 | ⏳ Faz 1 (UPC/ASIN alanlarıyla) |
| 8 | Supplement/Nutrition Facts, alerjen, FDA (DSHEA) uyarısı, Prop 65 ürün sayfasında | Webstaurant [D], OEHHA [A] | URN-1 | ⏳ Faz 1 |
| 9 | "Best by ≥ AA/YYYY" ürün sayfasında; lot no sevk irsaliyesi ve faturada | (bizim tasarım — örneği bulunamadı) | STK-3 | ⏳ Faz 1 |
| 10 | Kart, ACH ve yalnızca onaylı hesaplara Net-30 + PO alanı | Shopify [D], BigCommerce [D], Amazon [A] | ODE-6 | ✅ PO zorunlu · ⏳ kredi limiti Faz 3 |
| 11 | Eyalet bazlı vergi muafiyet sertifikası, başvuruda toplanır | Webstaurant [D], Amazon ATEP [A] | VRG-4 | ✅ Sertifika no + NJ + süre · ⏳ dosya yükleme Faz 3 |
| 12 | Geçmiş siparişten "tekrar sipariş" ve "yeniden al" ızgarası | Webstaurant [D], Shopify [D], BigCommerce [D] | SEP-7 | ⏳ Faz 2 (öne alınabilir) |
| 13 | Hızlı sipariş: SKU yapıştırma + CSV yükleme, sonuç tablosu | Uline [D], BigCommerce [D] | mevcut | ✅ Var · ⏳ UPC ile eşleştirme Faz 1 |
| 14 | Self-servis iade (RMA), PDF fatura ve hesap ekstresi | Webstaurant [D], BigCommerce [D] | ODE-4, ODE-6 | ⏳ Faz 1 / Faz 3 |
| 15 | LTL için rampa / liftgate / önceden arama seçenekleri; kayıtlı listeler; temsilci adına sipariş; barkod okuma | Webstaurant [D], BigCommerce [D], KeHE [A] | KRG-3, SEP-7 | ⏳ Faz 2–3 |

## 2. Alana göre ayrıntılar

**Fiyat kilidi ve başvuru.** Faire her ürün kutucuğunda kilit simgesi ve "Unlock wholesale price" gösteriyor;
katalog gezilebilir ve aranabilir kalıyor [D]. Fullscript, NPI numarası girilince anında, belge yüklenince 1 iş
gününde onaylıyor; sipariş yalnızca doğrulanmış işletme adresine gidiyor [A]. **Bizde:** fiyat tarayıcıya hiç
gönderilmiyor (RSC dahil); başvuru doğrulanmış hesaba bağlı; değer önerileri (Net-30, $150 asgari, 14 gün iade,
NJ'den sevk) kilit mesajının yanında.

**Ürün sayfası.** Webstaurant: "4/Case $222.99 ($55.75/each)", UPC, özellik tablosu, "Usually ships in 1 business
day", Prop 65 uyarısı ve "Resources and Downloads" alanı [D]. Uline: kademe tablosu + "In Stock / Ships Today" [D]
(ama her kademede aynı fiyat — gereksiz gürültü). **Bizde eksik:** UPC/GTIN, uyum paneli, indirilebilir teknik
föy ve görseller (Faz 1, URN-1).

**Uyum (Prop 65).** OEHHA'nın internet satışı güvenli limanı: uyarı ürün sayfasında, "WARNING" bağlantısıyla ya da
satın alma tamamlanmadan önce belirgin şekilde gösterilmeli; aranarak bulunan uyarı sayılmaz. 2025 değişikliklerinin
uyum tarihi 2028 [A]. **Bizde:** `prop65_warning` alanı + Kaliforniya'ya giden siparişte ödeme öncesi gösterim (Faz 1).

**Hız araçları.** Uline'ın hızlı sipariş sayfası "H-101, 25" biçiminde yapıştırmayı kabul ediyor [D]; BigCommerce
şablon CSV + sürükle-bırak yükleme, adlandırılmış alışveriş listeleri ve "Repurchase" sunuyor [D]; Webstaurant
"Rapid Reorder" ve otomatik tekrar sipariş [D].

**Sepet ve ödeme.** Webstaurant kargo seçeneklerinde dört adres tipi (ticari/konut × liftgate var/yok) ve "konut,
liftgate yok"u "son derece dikkatli kullanın" uyarısıyla sunuyor [D]. Shopify şirket başına Net 7–90 vade [D];
Global Industrial Net-30 için D&B puanı ya da iki ticari + bir banka referansı istiyor [A]; Amazon "Pay by Invoice"
30 gün [A].

**Sipariş sonrası.** BigCommerce fatura portalı: açık/geciken bakiye, PDF fatura, CSV dışa aktarma, birden çok
faturayı tek seferde kısmi/tam ödeme [D]. Webstaurant: "My Orders → Return Items" [D].

**Güven.** Politika bağlantıları alt bilgide + sepette ve ürün sayfasında kısa özet; hesap temsilcisinin adı ve
doğrudan hattı; mesai saatlerinde canlı destek. Faire'in Trustpilot puanı 4,6, şikâyetler hasar, doğrulama gecikmesi
ve yavaş destekte toplanıyor [A] — hızlı insan desteği bizim için gerçek bir avantaj.

## 3. Örnek alınmayacaklar

- **Yalnızca istemci tarafında fiyat gizleme** — HTML veya RSC verisinde fiyat varsa herkes okuyabilir.
- **"Doğrulama ilk siparişle başlar"** (Faire) — kuralımız fiyattan önce onay.
- **Ücretli üyelikle bedava kargo** (WebstaurantPlus, aylık $99) [D] — küçük bağımsız perakendeciye uygun değil.
- **%20–30 iade masrafı ve "sarf malzemesi iade edilmez"** (Webstaurant) [D] — 14 gün, açılmış ürün dahil iade kararımızla çelişir.
- **ACH için asgari tutar** (Webstaurant $500+) [D] — ACH bizim için daha ucuz, teşvik edilmeli.
- **Sert sepet sınırları** (Uline 95 kalem) [D] ve her kademede aynı fiyat.
- **Özellik yerine geçici çözüm** (Webstaurant'ta teklif almak için kupon alanına "QUOTE" yazmak) [D] — gerçek "Teklif PDF'i indir" yapılmalı.
- **Zayıf mobil uygulama** (KeHE bayi uygulaması 2,4/5) [A] — önce duyarlı web.
- **ASIN'in yanında Amazon fiyatı veya "Amazon'a göre ucuz" ifadesi** [H] — MAP ve marka sorunu; ASIN yalnızca referans.
- **Uyuşmayan puan gösterimi** (Webstaurant başlıkta 5 yıldız, ortalama 4,8) [D] — bizde puan yalnızca gerçek yorumlardan.

## 4. Kaynaklar

- Faire ana sayfa: https://www.faire.com/ · başvuru: https://faire.com/support/articles/29881314074139
- Shopify B2B özellikleri: https://help.shopify.com/en/manual/b2b/getting-started/features · adet kuralları: https://help.shopify.com/en/manual/b2b/catalogs/quantity-pricing
- BigCommerce B2B Edition alıcı işlevleri: https://support.bigcommerce.com/articles/en_US/Knowledge/B2B-Edition-Buyer-Functions
- Emerson / Fullscript toptan politika: https://help.emersonecologics.com/articles/accessing-fullscripts-wholesale-policy · kargo: https://support.fullscript.com/articles/im-a-practitioner-what-are-your-available-shipping-options-for-wholesale-orders
- WebstaurantStore ürün örneği: https://www.webstaurantstore.com/regal-gourmet-peppercorn-medley-5-lb-case/10207330KT.html · SSS: https://www.webstaurantstore.com/ask.html · konut/ticari teslimat: https://www.webstaurantstore.com/residentialcommercial.html
- Uline hızlı sipariş: https://www.uline.com/Ordering/QuickOrder · ürün örneği: https://www.uline.com/Product/Detail/S-4122/Corrugated-Boxes-200-Test/12-x-12-x-12-200-lb-Test-Corrugated-Boxes
- Global Industrial bayi şartları: https://www.globalindustrial.com/reseller/terms-conditions.html
- Amazon vergi muafiyet programı: https://www.amazon.com/gp/help/customer/display.html?nodeId=TRK3SQu8MNsJHVLTnF · faturayla ödeme: https://www.amazon.com/gp/help/customer/display.html?nodeId=201961660
- Prop 65 internet uyarıları (Kelley Drye): https://www.kelleydrye.com/viewpoints/blogs/kelley-green-law/prop-65-update-big-changes-to-the-short-form-and-internet-warnings
- KeHE CONNECT uygulaması: https://apps.apple.com/us/app/-/id1450029561
- Boxed iflası: https://www.grocerydive.com/news/boxed-files-chapter-11-bankruptcy/646606
- NJ satış vergisi (gıda, takviye, kargo): https://nj.gov/njbonds/treasury/taxation/pdf/pubs/tb/tb70.pdf · https://www.nj.gov/treasury/taxation/pdf/pubs/sales/su4.pdf
