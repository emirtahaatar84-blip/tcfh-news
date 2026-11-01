# Yol Haritası — v0.2.5 → Beta

> **Mevcut sürüm:** `0.2.5` (alfa) · **Beta:** `0.5.0` (Faz 10)
> Sürümleme politikası: [VERSIONING.md](VERSIONING.md)

Her faz **tek başına yayına alınabilir**. Bir faz bitmeden sonrakine geçilmez.

---

## Genel bakış

| Faz | Sürüm | Aşama | Konu | Süre (tahmini) |
|---|---|---|---|---|
| 6 | `0.3.0` | alfa | Arama ve keşif | 1 hafta |
| 7 | `0.3.5` | alfa | PWA ve çevrimdışı | 1 hafta |
| 8 | `0.4.0` | alfa | SEO ve keşfedilebilirlik | 4 gün |
| 9 | `0.4.5` | alfa | Performans | 4 gün |
| 10 | **`0.5.0`** | **BETA** | Editör ve moderasyon | 1,5 hafta |
| 11 | `0.5.5` | beta | KVKK uyumlu analitik | 1 hafta |
| 12 | `0.6.0` | beta | E-posta bülteni | 1 hafta |
| 13 | `0.6.5` | beta | İçerik zenginleştirme | 1 hafta |
| 14 | `0.7.0` | beta | Test ve CI | 4 gün |
| 15 | `0.7.5` | beta | Kararlılık, 1.0 hazırlık | 1 hafta |

**Toplam:** ~9 hafta · **Beta:** 5. hafta sonunda (Faz 10)

---

## Faz 6 — Arama ve keşif · `0.3.0`

**Sorun:** Arama `LIKE %q%` ile çalışıyor. "enflasyon" yazınca "enflasyonist" bulunmuyor, yazım hatası tolere edilmiyor, sonuçlar alaka sırasına göre değil.

| İş | Ayrıntı |
|---|---|
| FTS5 indeksi | SQLite `fts5` sanal tablosu: başlık (ağırlık 3), özet (2), gövde (1), etiket (2) |
| Yazım toleransı | Trigram benzerliği ≥ 0.6 → "enflasyn" → "enflasyon" |
| Alaka sıralaması | `bm25()` + tazelik + kaynak sayısı ağırlıklı |
| Öneri | Yazarken sonuç (debounce 200 ms), son aramalar `localStorage` |
| Filtreler | Kategori + tarih aralığı + kaynak sayısı (≥3) |
| Uç | `GET /api/search?q=&limit=&kategori=&sirala=` (geriye uyumlu) |

**Ölçüt:** 30 sorguluk test setinde alaka ilk 3'te %80 · yazım hatası testi geçer · arama 100 ms altı.

---

## Faz 7 — PWA ve çevrimdışı · `0.3.5`

**Sorun:** Service worker var ama yalnızca kabuk önbelleği. Uçakta/metroda okuma yok.

| İş | Ayrıntı |
|---|---|
| Çevrimdışı okuma | Ziyaret edilen makalelerin gövdesi Cache API'de (son 20, 7 gün) |
| Çevrimdışı liste | `/tr/offline` sayfası: kayıtlı makaleler |
| Arka plan senkron | Bağlantı gelince okunmamışları yenile |
| Kurulum | `beforeinstallprompt` akışı iyileştirme + iOS talimatı |
| Bildirim tercihi | Kategori seçimi (zaten var) + sessiz saat (22:00–08:00) |

**Ölçüt:** Uçak modunda son 5 makale açılıyor · Lighthouse PWA geçer · çerez 0.

---

## Faz 8 — SEO ve keşfedilebilirlik · `0.4.0`

**Sorun:** Structured data yalnızca `NewsArticle`. Etiket sayfaları sitemap'e yeni girdi ama sayfa düzeyinde schema yok.

| İş | Ayrıntı |
|---|---|
| `FAQPage` schema | Portre ve münazara sayfalarındaki SSS bölümleri |
| `ItemList` schema | Kategori/etiket listeleri |
| `BreadcrumbList` | Tüm detay sayfalarında tutarlı |
| `SpeakableSpecification` | Sesli okuma için işaretleme |
| OG görseli | Haber başlığı + kategori ile dinamik 1200×630 |
| Hreflang denetimi | tr/en/x-default eksiksiz; canonical çakışması yok |

**Ölçüt:** Google Rich Results testi hata vermez · 100 haber sayfasında canonical tutarlı.

---

## Faz 9 — Performans · `0.4.5`

**Sorun:** Lighthouse 94. Hedef 100. LCP 3.2 sn.

| İş | Ayrıntı |
|---|---|
| Görsel optimizasyonu | AVIF → WebP fallback, `srcset`, boyut belirtme |
| Font subsetting | Yalnızca kullanılan glifler (latin + latin-ext) |
| Critical CSS | İlk ekran için satır içi |
| ISR | Ana sayfa 60 sn, etiket 300 sn (şu an tamamen dinamik) |
| Preconnect | Yalnızca gerçek dış kaynaklar |

**Ölçüt:** Mobil performans **100** · LCP < 2.0 sn · TBT < 200 ms · CLS < 0.05.

---

## Faz 10 — Editör ve moderasyon · `0.5.0` · **BETA**

**Sorun:** Owner paneli var ama rapor kuyruğu, atıf düzeltme ve portre onayı elle SQL ile yapılıyor.

| İş | Ayrıntı |
|---|---|
| Rapor kuyruğu | `NewsReport` listesi: durum (yeni/incelendi/reddedildi), toplu işlem |
| Atıf paneli | Kurulan atıflar + "kaldır" / "kara listeye al" (zaten var, UI eklenecek) |
| Portre onayı | Gölge moddaki portreleri tek tıkla yayına al / geri çek |
| Toplu düzenleme | Kategori değiştir, etiket ekle/çıkar, kaldır |
| Denetim kaydı | Her editör işlemi `auditLog`'a |
| Sağlık panosu | `/admin` üstünde: son üretim, bekleyen rapor, token kullanımı |

**Beta duyurusu:** README'de "beta" rozeti, sürüm `0.5.0`, kararlı API sözü.

**Ölçüt:** Rapor → inceleme → işlem akışı uçtan uca çalışır · tüm işlemler kayıtlı · panel mobilde kullanılabilir.

---

## Faz 11 — KVKK uyumlu analitik · `0.5.5`

**Sorun:** Hangi haberin okunduğu bilinmiyor (`viewCount` var ama dağılım yok). Üçüncü taraf analitik yasak.

| İş | Ayrıntı |
|---|---|
| Toplu sayaç | Sayfa görüntüleme: `PageView { path, date, hour, count }` — IP/kullanıcı YOK |
| Isı haritası | Saatlik dağılım (0–23), günlük trend |
| Kategori popülerliği | Etiket/kategori bazında okunma |
| Panel | `/admin/analytics`: son 30 gün grafiği |
| Saklama | 180 gün sonra otomatik silme |

**Ölçüt:** Çerez 0 · IP saklanmıyor · panel grafiği doğru · 180 gün temizliği test edilmiş.

---

## Faz 12 — E-posta bülteni · `0.6.0`

**Sorun:** Günlük özet yalnızca sitede ve Telegram'da.

| İş | Ayrıntı |
|---|---|
| Double opt-in | E-posta → onay bağlantısı → aktif (KVKK) |
| Gönderim | SMTP env (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`); yoksa kapalı |
| Şablon | Düz metin + basit HTML (resim yok, izleme pikseli YOK) |
| Çıkış | Tek tık, jetonlu bağlantı |
| Uyum | `List-Unsubscribe` başlığı |

**Ölçüt:** Test aboneye e-posta ulaşır · onaysız adres gönderilmez · piksel yok.

---

## Faz 13 — İçerik zenginleştirme · `0.6.5`

**Sorun:** Haberler birbirinden kopuk; "aynı konudaki diğer haberler" zayıf.

| İş | Ayrıntı |
|---|---|
| Konu merkezleri | `/tr/konu/<slug>`: etiketlerden türetilen kalıcı konu sayfaları |
| Seri takibi | Aynı olayın gelişmeleri numaralı (1/3, 2/3) |
| Özet kartı | Detay sayfasında "30 saniyede" kutusu (ilk 3 madde) |
| İlgili içerik | Varlık + olay kümesi + kategori ağırlıklı |
| Arşiv | Yıl/ay arşivi (`/tr/arsiv/2026/11`) |

**Ölçüt:** Konu sayfası en az 3 haber içerir · seri numaralandırma doğru · ilgili içerik boş değil.

---

## Faz 14 — Test ve CI · `0.7.0`

**Sorun:** Testler elle çalıştırılıyor; regresyon riski.

| İş | Ayrıntı |
|---|---|
| GitHub Actions | `push`/`PR`: typecheck → test → build → tokens:check → spacing:audit |
| E2E | Playwright: ana akış, arama, etiket, hata bildir, dil değiştirme |
| Kapsam | `vitest --coverage`, eşik %70 |
| Sürüm etiketi | `package.json` değişince otomatik `git tag` |
| Matris | Node 20 ve 22 |

**Ölçüt:** CI yeşil · E2E 10 senaryo geçer · kapsam ≥ %70.

---

## Faz 15 — Kararlılık, 1.0 hazırlık · `0.7.5`

**Sorun:** Hata izleme yok; yedekleme elle; migration geri alma prosedürü yok.

| İş | Ayrıntı |
|---|---|
| Yedekleme | Günlük otomatik SQLite yedeği, 30 gün saklama, geri yükleme testi |
| Migration geri alma | Her migration için `down.sql` + prosedür dokümanı |
| Hata izleme | Sunucu tarafı yapılandırılmış log + `/api/health` genişletme |
| Doküman | Kurulum, dağıtım, sorun giderme, SSS |
| Yük testi | 100 eşzamanlı istek, p95 < 500 ms |
| 1.0 kontrolü | API sözleşmesi dondurma, veri modeli dondurma |

**Ölçüt:** Yedekten geri dönüş çalışır · yük testi geçer · doküman tam · 1.0 hazır.

---

## Beta'ya giriş koşulları (Faz 10)

1. Faz 6–9 tamamlanmış ve canlıda
2. Lighthouse mobil performans ≥ 90, erişilebilirlik = 100
3. Tüm editör işlemleri denetim kaydında
4. Bilinen kritik hata yok
5. `CHANGELOG.md` ve `README.md` beta durumunu yansıtıyor

## 1.0'a giriş koşulları (Faz 15 sonrası)

1. API sözleşmesi 3 ay değişmedi
2. Veri modeli migration'ları geri alınabilir
3. Kapsam ≥ %70, CI zorunlu
4. Yedekleme/geri yükleme test edilmiş
5. En az 2 hafta kesintisiz üretim

---

## Değişmeyen ilkeler

- **Çerez yok.** Tercihler yalnızca `localStorage` (`storageVersion: 1`).
- **Üçüncü taraf izleme yok.** Analitik sunucu taraflı ve toplu.
- **API anahtarı istemcide olmaz.** Yalnızca sunucu (env veya DB).
- **Doğrulanmamış iddia yayına girmez.** Sayı/tarih/isim kaynakla eşleşir.
- **Kesinlik > kapsama.** Atıf kuramıyorsa kurmaz.
- **Kaynak şeffaflığı.** Tek kaynaklı haber rozetle işaretlenir.
