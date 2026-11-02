# Haber Yayılma Motoru

Haber yayınlandığı anda **beş kanala** dağıtılır; her kanalın sonucu kaydedilir, başarısız olan üstel geri çekilmeyle yeniden denenir.

```
NewsItem yayınlandı
        │
        ▼
  distributeStory(id)          ← fire-and-forget, yayını bloklamaz
        │
        ├─ planChannels()      ← hangi kanal, neden gönderilsin
        │
        ├─► push      ─ PWA bildirimi (doğrulanmış + taze)
        ├─► indexnow  ─ Bing/Yandex/Seznam/Naver (her haber)
        ├─► social    ─ X taslağı (doğrulanmış haberler)
        ├─► rss       ─ akış (otomatik)
        └─► sitemap   ─ dizin (otomatik)
        │
        ▼
  DistributionLog               ← her deneme: durum, süre, hata
        │
        └─► retryFailedDistributions()   ← 10 dakikada bir, 4 denemeye kadar
```

## Neden gerekliydi

Önceden yayılma dağınıktı: push `processor.ts` içinden çağrılıyordu, IndexNow yoktu, sosyal paylaşım elle yapılıyordu ve **hiçbirinin sonucu kaydedilmiyordu**. Başarısız gönderim sessizce kayboluyordu.

## Kanallar

| Kanal | Ne zaman gider | Ne yapar |
|---|---|---|
| **push** | Doğrulanmış (≥2 kaynak) **veya** öncelikli kategori, son 6 saat | Web Push bildirimi |
| **indexnow** | Her haber | Arama motorlarına anında URL bildirimi |
| **social** | Doğrulanmış haber | X paylaşım taslağı üretir (otomatik gönderim yok) |
| **rss** | Her haber | Akış otomatik güncellenir |
| **sitemap** | Her haber | Dizin otomatik güncellenir |

**Öncelikli kategoriler (push):** Gündem, Sağlık, Ekonomi, Siyaset, Dünya.

## Neden her haber her kanala gitmez

Canlı veri: 4608 haberin %89'u tek kaynaklı. Hepsine bildirim göndermek spam olurdu.

| Durum | push | social |
|---|---|---|
| 3 kaynak, taze | ✅ | ✅ |
| 1 kaynak, Sağlık, taze | ✅ | ❌ |
| 1 kaynak, Teknoloji, taze | ❌ | ❌ |
| 3 kaynak, 12 saat önce | ❌ | ✅ |

## Idempotency

Aynı haber + kanal ikinci kez gönderilmez. Anahtar:

```
dedupeKey = sha256(newsId + ":" + channel)[0..32]
```

`DistributionLog.dedupeKey` UNIQUE — tekrar deneme aynı satırı günceller.

## Geri çekilme

| Deneme | Bekleme |
|---|---|
| 0 | hemen |
| 1 | 2 dakika |
| 2 | 8 dakika |
| 3 | 30 dakika |

4 denemeden sonra vazgeçilir; kayıt `failed` olarak kalır (elle inceleme).

## API

```
GET  /api/admin/distribution?saat=24     → kanal bazlı özet + son 30 kayıt
POST /api/admin/distribution             → bekleyen başarısızları elle dene
GET  /{INDEXNOW_KEY}.txt                 → sahiplik doğrulama dosyası
```

## Ortam değişkenleri

```bash
INDEXNOW_KEY=""                    # boş = IndexNow kapalı (hata üretmez)
ENABLE_DISTRIBUTION_RETRY=true     # otomatik yeniden deneme
```

## Ölçüm (canlı, 2 Kasım 2026)

| Kanal | Durum |
|---|---|
| indexnow | **4 gönderim · HTTP 200 · 2 URL/haber · 500-700 ms** |
| push | 0 (test abonesi yok) |
| social | 4 atlandı (tek kaynaklı haberler) |
| rss / sitemap | 4 gönderim |
| Retry | **3/3 başarılı** |

## Sınırlar

- **Sosyal otomatik gönderim yok.** Taslak üretilir; X API anahtarı gerektiği için yayın editör onayında.
- **Push abone yoksa atlanır** (hata değil).
- **IndexNow Google'a gitmez** — Google sitemap + crawl kullanır.
