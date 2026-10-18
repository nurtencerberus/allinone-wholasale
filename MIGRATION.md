# Başka Bir Projeden Kod / İçerik Taşıma Rehberi

## Durum: bağlantı neden açılamadı?

Verdiğiniz bağlantı — `https://arena.ai/c/01a14ade-…` — **arena.ai üzerindeki özel bir konuşma
sayfası**. İstek attığımda yalnızca sitenin kabuğu geliyor (`Arena | Benchmark & Compare the Best
AI Models`); konuşma içeriği JavaScript ile çiziliyor ve oturum açmamış bir istemciye veri
döndürmüyor. Yani o projenin kodunu/görsellerini **şu anda göremiyorum**.

Bu dosya, o projedeki içeriği bu projeye taşımanız için izlenecek yolu ve kodun nereye
yerleşeceğini anlatıyor.

---

## 1 · Kodu bana nasıl getirirsiniz (en kolaydan zora)

| Yöntem | Nasıl | Elde edilen |
| --- | --- | --- |
| **A. Dosyaları yapıştırın** | arena.ai konuşmasındaki kod bloklarını kopyalayıp buraya yapıştırın (en fazla birkaç dosya gerekiyor) | Hemen uygularım |
| **B. ZIP / repo** | Proje klasörünü ZIP'leyip projenin köküne atın (`/import/other-project.zip`) ya da GitHub/GitLab linkini verin | Tam kaynak, çakışmaları ben yönetirim |
| **C. Ekran görüntüsü** | Sadece tasarım/yerleşim önemliyse sayfanın ekran görüntüsünü verin | Arayüzü birebir yeniden kurarım |
| **D. Arena dışa aktarma aracı** | arena.ai konuşmasını Markdown olarak indirin (bkz. aşağıdaki eklentiler) | Konuşmadaki tüm kod blokları |

**arena.ai konuşmasını dışa aktarma araçları:**
- `github.com/dexforint/arena-utils` — Chrome eklentisi; konuşma her tur için ayrı Markdown dosyası
  olarak iner (`1.md`, `2.md`, …) ve kod tabanı anlık görüntüleri üretir.
- Greasyfork üzerindeki *"Arena Ai / LMSYS Arena Chat Exporter"* kullanıcı betikleri — JSON/TXT/ZIP
  olarak dışa aktarır.

> Not: Dışa aktarma işlemi tamamen sizin tarayıcınızda, **sizin oturumunuzla** yapılır; hiçbir
> şifre/çerez üçüncü bir tarafa gitmez.

---

## 2 · Bana hangi dosyalar gerekli?

Öncelik sırasıyla — hepsi değil, projede ne olduğuna göre ikisi yeter:

1. **Sayfa içerikleri**: ana sayfa, ürün detay, kategori/mağaza sayfaları (`page.tsx`, `*.jsx`)
2. **Stil/tasarım**: renk paleti, tipografi, düzen tanımları (`globals.css`, `tailwind.config.*`)
3. **Veri**: ürün listesi (JSON/CSV/XLS) — bunu benim aracım da okuyor (bkz. §4)
4. **Görseller**: `public/images/` altındaki dosyalar (ZIP ile)
5. **Backend/API** (varsa): veritabanı şeması, API route'ları

---

## 3 · Merge haritası: kod nereye gider?

| Elinizdeki | Bu projedeki karşılığı | Not |
| --- | --- | --- |
| Ana sayfa JSX/HTML | `src/app/page.tsx` | Metinler ve bölüm sırası birebir alınır |
| Mağaza / filtre sayfası | `src/app/shop/page.tsx` | Filtre mantığı korunur, tasarımı uyarlanır |
| Ürün detay sayfası | `src/app/products/[slug]/page.tsx` | JSON-LD bu projede kalır (SEO) |
| CSS / tema renkleri | `src/app/globals.css` (`@theme` bloğu) | Marka renkleri tek yerden değişir |
| Marka bilgileri (logo, adres, telefon) | `src/lib/site.ts` | `NEXT_PUBLIC_SITE_URL` ile alan adı |
| Ürün verisi | `src/db/schema.ts` + `products` tablosu | **§4'teki içe aktarma ile otomatik** |
| Görseller | `public/images/` | Yolları ürün kayıtlarında `image`/`images` alanları taşır |
| Sipariş / ödeme kodu | `src/lib/checkout.ts`, `src/app/api/**` | Bu projedeki sürüm PCI-DSS uyumlu (Stripe Elements) — üzerine yazılmasını önermem |
| Kullanıcı / admin | `src/app/account/**`, `src/app/admin/**` | scrypt + httpOnly çerez oturumları korunur |

**Korunmasını önerdiklerim** (zaten çalışır durumda): Stripe Elements ödeme, boyutsal kargo
motoru, eyalet satış vergisi, XLS/CSV sipariş formu, sitemap/robots/JSON-LD, admin panosu.

---

## 4 · Katalog verisini taşımak için hazır araç

`/admin/catalog` sayfası ve `GET|POST /api/admin/catalog` uçları eklendi:

- **Export**: tüm katalog JSON olarak iner (SKU, fiyat, kademeler, koli ölçüleri/ağırlıkları,
  görseller, özellikler). Para alanları **sent** cinsinden integer'dır.
- **Import**: JSON yapıştırın ya da dosya yükleyin. Satırlar **SKU** ile eşleşir: varsa güncellenir,
  yoksa oluşturulur. `name`, `price`, `qty`, `weight` gibi alan adları da kabul edilir; fiyatlarınız
  dolar cinsindense dosyaya `"currency": "usd"` ekleyin.

```json
{
  "currency": "usd",
  "products": [
    {
      "sku": "OTHER-1001",
      "name": "Collagen Peptides 16 oz",
      "category": "supplements",
      "brand": "Your Brand",
      "qty": 12,
      "price": 144.0,
      "msrp": 24.99,
      "weight": 15,
      "length": 15, "width": 11, "height": 9,
      "stock": 40
    }
  ]
}
```

Kategoriler `supplements`, `pantry`, `home` olmalı; tahmin edilebilir değerler (vitamin, coffee,
decor…) otomatik eşlenir. Hatalı satırlar atlanır ve nedeni listelenir.

Sipariş formu tarafı ise zaten XLS/CSV okuyor:
`/api/order-sheet/download?format=xlsx` → doldur → `/quick-order`'e yükle.

---

## 5 · Uygulama sırası (öneri)

1. Elinizdeki projenin **kodunu** buraya getirin (§1) → ben sayfaları bu yapıya uygularım.
2. **Ürün verisini** JSON olarak içe aktarın (§4) ya da dosyayı verin, ben yüklerim.
3. **Görselleri** `/import/images/` altına bırakın, ürün kayıtlarına bağlarım.
4. Tema/marka bilgilerini `src/lib/site.ts` + `globals.css` üzerinden güncelleriz.
5. `npx next typegen` → `npm exec tsc -- --noEmit` → `npm run build` → `build_and_start` doğrulaması.
6. Canlıya alım için `DEPLOYMENT.md`.

---

## 6 · Bu projede hâlihazırda ne var? (koru / değiştir tablosu)

| Özellik | Durum |
| --- | --- |
| Filtrelenebilir katalog + ürün detay (galeri, yorumlar, JSON-LD) | ✅ |
| Kayar sepet (localStorage) + 3 adımlı checkout | ✅ |
| scrypt + httpOnly çerez, çift aşamalı e-posta doğrulama, tek kullanımlık şifre sıfırlama | ✅ |
| Toptan başvuru, EIN doğrulama, hesaba özel fiyat + vergi muafiyeti | ✅ |
| Hızlı sipariş (SKU girişi) + XLS/CSV sipariş formu indirme/yükleme | ✅ |
| Boyutsal kargo (dim weight ÷139, LTL) + eyalet satış vergisi | ✅ |
| Stripe Elements (PCI-DSS SAQ-A) | ✅ |
| Admin: başvurular, sipariş & kargo takibi, kullanıcı yönetimi, katalog aktarımı | ✅ |
| sitemap.xml / robots.txt / JSON-LD | ✅ |

Yani taşınacak olan genellikle **içerik, tasarım ve ürün verisi** olur; altyapı burada zaten duruyor.
