# Değişiklik Günlüğü

Bu dosya [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler.
Sürümleme politikası için [VERSIONING.md](VERSIONING.md).

## [0.2.5] — 2026-11-01 · **alfa**

Beş fazlık güven ve altyapı çalışması. Bu sürümden sonra ürün **beta**'ya hazırlanır.

### Eklendi

**Faz 1 — Güven ve doğrulama**
- `lib/fact-check.ts`: özet üzerindeki sayı/tarih/isimleri kaynakla karşılaştırır; doğrulanamayan olgu varsa haber yayına alınmaz
- `POST /api/report`: hata bildirimi; IP tuzlu SHA-256 ile saklanır, saatte 5 istek
- `NewsItem`: `aiGenerated`, `verifiedSourceCount`, `contentHash`, `factCheckStatus/Notes`
- `GET /api/health`: son başarılı üretim zamanı; 2 saatten eskiyse hata loglanır
- İçerik hash önbelleği: aynı kaynak tekrar sentezlenmez

**Faz 2 — Kaynak karşılaştırma**
- `GET /api/news/:id/sources`: kaynak kartları (ad, link, kısa özet, örtüşme skoru)
- Haber detayında "Kaynakları karşılaştır" bölümü
- `GET /api/tags`, `GET /api/tags/:tag`: etiket listesi ve etikete göre haberler
- Tıklanabilir etiket rozetleri, `/tr/etiket/<tag>` sayfası
- Arama etiketlerde de sonuç veriyor

**Faz 3 — Zaman çizelgesi ve RSS**
- `GET /api/timeline/:scope/:value`: dikey zaman çizelgesi + "şu ana kadar ne oldu" özeti (önbellekli)
- `/atom.xml` (Atom 1.0) + `/rss/<kategori>` düzeltmesi (proxy artık dile yönlendirmiyor)
- RSS/Atom auto-discovery `<head>`'de
- Kişisel ilgi filtresi: yalnızca `localStorage`, "Tümünü göster" ile sıfırlama

**Faz 4 — Günlük özet ve sesli bülten**
- `DailyDigest` modeli: her gün 08:00 (Europe/Istanbul) ayrı kayıt
- Telegram botu: `/start` ve `/dur`; yalnızca `chatId` saklanır
- Sesli bülten: mevcut TTS hattı ile mp3, 14 gün saklama
- Podcast sayfasında oynatıcı (oynat/duraklat, hız, ilerleme)

**Faz 5 — İzleme ve erişilebilirlik**
- sitemap: etiket sayfaları dahil
- `lib/pipeline-alert.ts`: üretim durursa Telegram uyarısı (saatte en fazla 1)
- `lib/token-budget.ts`: günlük token sayacı; %80 uyarı, %100 üretim durur
- Lighthouse mobil: performans **56 → 94**, erişilebilirlik **96 → 100**

### Düzeltildi
- Doğrulama kapısı çok katıydı: Türkçe büyük harf kullanımı yüzünden gerçek haberler reddediliyordu
- `/rss/<kategori>` proxy tarafından dile yönlendiriliyordu
- Açık temada kategori rozetleri okunmuyordu (kontrast 1.11 → 5:1)
- Mobil alt menüde `aria-label` görünen metinle uyuşmuyordu

### Notlar
- Yeni bağımlılık **yok**
- 189 test
- Çerez kullanılmaz; tüm tercihler `localStorage` (`storageVersion: 1`)
