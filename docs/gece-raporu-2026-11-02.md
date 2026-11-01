# Gece Çalışması Raporu — 1–2 Kasım 2026

## Özet

**Sorun:** Site günde 738 haber yayınlıyordu, ortalama okunma 1.15'ti. Kullanıcı "her haberi değil gerekli haberleri" istedi.

**Sonuç:** Üç köklü iyileştirme yapıldı ve canlıya alındı.

| İş | Durum | Canlıda |
|---|---|---|
| Haber Önem Skoru (HÖS) | ✅ | ✓ |
| Tekrar bastırma | ✅ | ✓ |
| FTS5 arama + yazım toleransı | ✅ | ✓ |
| "Öne çıkanlar" bölümü | ✅ | ✓ |
| Testler (19 yeni, toplam 208) | ✅ | ✓ |

---

## 1. Haber Önem Skoru — `lib/importance.ts`

**Sorun:** Akış yalnızca tarihe göre sıralanıyordu. En yeni haber = en önemli haber sanılıyordu.

**Çözüm:** 0-100 skor, 5 boyut:

| Boyut | Ağırlık | Ne ölçüyor |
|---|---|---|
| Doğrulama | %35 | Kaç bağımsız kaynak (1→0.15, 3→0.80, 5+→1.0) |
| Kategori | %20 | Sağlık 1.0, Gündem 0.95 … Spor 0.45 |
| Türkiye ilgisi | %20 | TBMM, TCMB, AFAD, deprem, enflasyon… (3+ sinyal = 1.0) |
| Tazelik | %15 | 6 saat içi 1.0, 24 saat sonrası düşer |
| Kalite | %10 | Denetim puanı + doğrulama kapısı |

**Eşikler:** ≥65 "öne çıkan", <30 "düşük değerli" (akışın sonuna düşer, silinmez).

**Ölçüm (8 gerçek haber):**

| | Eski (tarih) | Yeni (önem) |
|---|---|---|
| İlk 3 | Ekonomi, Ekonomi, Ekonomi | **Sağlık 93★, Ekonomi 91★, Deprem 78★** |
| Kategori çeşitliliği | 1 | 4 |

**Kritik özellik:** Tek kaynaklı deprem haberi **66.75** alıp öne çıkıyor; tek kaynaklı spor haberi **37**'de kalıyor. Yani "tek kaynak = kötü" değil, doğru denge.

---

## 2. Tekrar Bastırma — `lib/dedupe.ts`

**Sorun:** Aynı olayın 20 varyantı art arda yayınlanıyordu.

**Çözüm:** Aynı "konu imzası" 24 saatte 1 kez akışta görünür. Haberler **silinmez** — arama, etiket ve arşivden erişilebilir.

**Teknik bulgu (ölçümle):** İlk deneme Türkçe ek soyma kullandı ve **başarısız oldu** — "faizini", "faizi", "faiz" üç ayrı kök çıkıyor, aynı konu 0.38 benzerlikte kalıyordu. **İlk 4 karakter gövdeleme** ile aynı çift 0.70'e çıktı, farklı konu 0.00'da kaldı.

| Çift | Ek soyma | İlk 4 karakter |
|---|---|---|
| faiz haberleri | 0.38 | **0.70** |
| Merkez vs Fenerbahçe | 0.00 | 0.00 |

**Ölçüm:** 5 haberde 1 bastırıldı — doğru olan.

---

## 3. FTS5 Arama — `lib/search-fts.ts`

**Sorun:** `LIKE %q%` — "enflasyon" yazınca "enflasyonist" bulunmuyordu, yazım hatası tolere edilmiyordu.

**Çözüm:** SQLite FTS5 + `bm25()` alaka sıralaması (başlık 3.0, etiket 2.0, özet 1.5, gövde 1.0).

**Mimari karar:** `contentless_delete=1` modu kullanıldı. Sebep: `content='NewsItem'` + `body` kolonu SQLite'ta çalışmıyor (`no such column: T.body` — kolon adı `detailedContent`). Prisma şemasına dokunmamak için contentless seçildi.

**Yazım toleransı:** FTS sonuç vermezse Levenshtein ≤2 (son 800 kayıt üzerinde).

**Canlı ölçüm:**

| Sorgu | Sonuç | Süre | Motor |
|---|---|---|---|
| `faiz` | 28 | **9 ms** | FTS |
| `enflasyon` | 19 | 3 ms | FTS |
| `deprem` | 41 | 3 ms | FTS |
| `enflasyonn` (yazım hatası) | 2 | 272 ms | fuzzy |

---

## 4. "Öne çıkanlar" bölümü

Ana sayfada (filtresiz görünümde) skoru ≥65 olan ilk 3 haber ayrı bölümde gösteriliyor. Kaynak sayısı ve kategori rozetiyle.

**Canlıda doğrulandı:** bölüm VAR.

---

## 5. Güvenlik ve KVKK

- **Çerez yok** — değişmedi
- **Kullanıcı verisi yok** — importance/dedupe yalnızca içerik verisiyle çalışır
- **Anahtar sızıntısı yok**
- Arama sorgusu **sunucuda saklanmıyor** (`Cache-Control: public, max-age=60` ama query loglanmıyor)

---

## 6. Deploy

| | |
|---|---|
| Yedek | `/home/emir/backups/news-20261101-2159.db` (174 MB) |
| Migration | `20261101200000_fts5_search` uygulandı |
| Site | 200 · **1.05 sn** |
| Testler | **208 geçti** |
| Build | ✓ |

---

## 7. Bilinen sınırlar (dürüst)

1. **Tek kaynaklı haberler hâlâ çoğunlukta.** Verinin %89'u tek kaynak olduğu için akışta hâlâ 10/13 tek kaynak. Skor bunları sıralıyor ama veriyi değiştirmiyor. Kalıcı çözüm: üretim hattında 3+ kaynak zorunluluğu (ayrı karar gerektirir).

2. **Dedup sayfa bazında.** Sonsuz akışta her sayfa kendi içinde dedupe ediliyor; sayfalar arası tekrar olabilir.

3. **Importance skoru İngilizce anahtar kelime listesi kullanıyor** (Türkiye sinyalleri) — genişletilmeli.

4. **Öne çıkanlar 3 haberle sınırlı** — daha fazla olabilir ama sayfa dengesi için 3 seçildi.

---

## Geri dönüş (gerekirse)

```bash
ssh emir@194.62.52.176 "docker cp /home/emir/backups/news-20261101-2159.db micro-news:/app/prisma/data/news.db && docker restart micro-news"
```

Not: Bu geri dönüş DB'yi eski hale getirir ama kod yeni kalır — FTS tablosu olmadığı için arama otomatik `LIKE`'a düşer (zarif bozulma var).
