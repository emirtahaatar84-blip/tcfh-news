# Münazara modülü (Ek Bölüm 11)

Münazara, mevcut tasarım dokusunun (renk, tipografi, yarıçap, boşluk, kart
biçimi) içinde yaşayan bir alt akıştır. Yeni ana menü öğesi yoktur:
"Kategoriler" açılır menüsüne ve mobil alt menüye girer.

## Sayfalar

| Adres | Ne gösterir |
|---|---|
| `/{lang}/munazara` | Seviye segmenti + yatay carousel + dikey kart akışı |
| `/{lang}/munazara/{slug}` | 13 bloklu münazara dosyası (stepper dahil) |
| `/{lang}/munazara/arsiv` | Seviye / kategori / sıralama filtreli arşiv |

Segment durumu URL'dedir: `/munazara?seviye=lise`. Geri tuşu ve paylaşım
çalışır. `role="tablist"` + ok tuşları desteklenir.

## Veri modeli

Prisma modelleri: `DebateTopic`, `DebateSource`, `DebateFeed`,
`DebateCandidate`. Ayrıntı: `prisma/schema.prisma`.

`DebateTopic` alanları: motion (metin/tür/kapsam), seviye, kategori,
zorluk/tartışılabilirlik/kanıt ihtiyacı/güncellik, iki taraf tezi, kilit
çatışmalar (hükümet + muhalefet + çürütme), ispat yükü, terimler, SSS,
kaynaklar, MUS skoru + bileşen dökümü + tek satır gerekçe.

`DebateCandidate` ham RSS içeriğini saklamaz; yalnızca başlık, özet
(en fazla 25 kelime), kaynak bağlantısı, motion önerisi ve MUS raporunu
tutar. Tekilleştirme `feedUrl + md5(guid|link)` ile yapılır.

## MUS — Münazara Uygunluk Skoru

Tek ayar noktası: `lib/debate/config.ts`. Algoritma: `lib/debate/score.ts`
(saf fonksiyonlar, testli).

```
MUS = 0.30 × Tartışılabilirlik
    + 0.20 × Kanıt bulunabilirliği
    + 0.20 × Güncellik
    + 0.15 × Kapsam
    + 0.10 × Seviyeye uygunluk
    + 0.05 × Özgünlük
```

- Bileşenler 0-5 ölçeğinden 0-100'e ölçeklenir.
- Seviye filtresi aktifken `levelFit` ağırlığı **0.20**'ye çıkar; diğerleri
  orantılı biçimde 0.80'e normalize edilir (toplam daima 1.00).
- Güncellik: 0-7 gün → 5 · 8-30 → 3 · 31-90 → 1 · >90 → 0.
- Kapsam: Türkiye'yi doğrudan etkiliyor → 5 · Türkiye bağlantısı → 3 ·
  yalnızca küresel → 2.
- Özgünlük: yok → 5 · benzer → 2 · aynı motion (30 gün) → 0.
- Tartışılabilirlik < 2 → otomatik elenir.
- Eşikler: ≥65 otomatik taslak · 50-64 inceleme · <50 elenir.
- Günlük kota: 3 (lise 2 + üniversite 1), aynı kategoriden en fazla 2.
- Akış sıralaması: `MUS×0.60 + Güncellik×0.30 + EditörSabitlemesi×0.10`
  (güncellik ve sabitleme 0-100'e normalize edilir), eşitlikte daha yeni.

### Örnek MUS tablosu (testlerle doğrulanır)

| Konu | Seviye | Tar. | Kanıt | Gün. | Kapsam | Seviye | Özgün. | MUS | Karar |
|---|---|---|---|---|---|---|---|---|---|
| Liselerde yapay zekâ ödevlerde serbest | Lise | 4/5 | 4/5 | 3 gün | TR | 4/5 | 5/5 | **88** | otomatik (87 seviye filtresinde) |
| Sosyal medyada yaş doğrulaması | Üniversite | 4/5 | 5/5 | 12 gün | TR | 5/5 | 5/5 | **86** | otomatik (88 seviye filtresinde) |
| "Soykırım kötüdür" (tek taraflı) | — | 1/5 | 5/5 | 4 gün | Global | 3/5 | 5/5 | 63 | **elenir** (tartışılabilirlik < 2) |

Kalite kapıları: ≥3 bağımsız kaynak, motion "Bu meclis … inanır"
biçiminde, iki tarafta ≥3 argüman, ≥3 kilit çatışma, özel nitelikli
kişisel veri yok, reşit olmayan adı yok, doğrulanmamış suçlama başlıkta yok.

## RSS doğrulama (26 Ekim 2026)

Betik: `node scripts/validate-debate-feeds.mjs` (veya `npm run debate:feeds`).
Kural: HTTP 200 + geçerli XML/Atom + ≥5 öğe + son 30 günde güncelleme.
Feed'ler yalnızca sunucuda/CLI'da çekilir; tarayıcıdan üçüncü tarafa istek
gitmez. Sonuç: `lib/debate/feed-status.json`.

| Feed | Durum | Neden |
|---|---|---|
| The Conversation | ✅ | 49 öğe · 0 gün |
| DW English | ✅ | 129 öğe · 0 gün |
| Pew Research | ✅ | 100 öğe · 0 gün |
| BBC Türkçe | ✅ | 16 öğe · 0 gün |
| Anadolu Ajansı | ✅ | 28 öğe · 0 gün |
| Brookings | ❌ | XML/Atom değil (HTML döndü) |
| Debating Matters | ❌ | Son güncelleme 129 gün önce |
| Intelligence Squared | ❌ | 0 öğe |
| Carnegie Council | ❌ | HTTP 404 |
| TÜBİTAK | ❌ | HTTP 404 |

Başarısız feed'ler `DebateFeed.status = "failed"` olarak kaydedilir ve üretim
hattında kullanılmaz.

## Çalıştırma

```bash
npm run debate:feeds     # RSS doğrulama raporu (+ --write ile JSON)
npm run debate:seed      # örnek dosyaları ve feed durumunu yükle
npm run test             # MUS/format/URL testleri dahil
```

VDS'de tohumlama:

```bash
docker exec tcfh-news node scripts/seed-debates.mjs
```

## Erişilebilirlik ve KVKK

- Segment kontrol: `role="tablist"`, `aria-selected`, ok tuşları, 44 px.
- Carousel: ok tuşları + önceki/sonraki düğmeleri + pointer sürükleme +
  yerel touch kaydırma; sürükleme sonrası yanlış tıklama engellenir.
- Stepper: `aria-current="step"`, `aria-live` duyuruları, duraklat/sıfırla.
- `prefers-reduced-motion` tüm geçişleri kapatır.
- Form yok, oy yok, kullanıcı argümanı yok. Okunma sayısı yalnızca toplu
  anonim sayaçtır; okuma konumu/seviye tercihi cihazda (localStorage,
  `storageVersion: 1`) tutulur.
