# Yeni Format — "Portre" Omurgalı Site

Bu doküman sitenin `/haber/<slug>` ve `/portre/<slug>` omurgası üzerine
yeniden kurulumunu, sesli okuma motorunu, KVKK sınırlarını ve yayın öncesi
test adımlarını içerir.

---

## 1. Mimari özet

```
                    ┌───────────────────────────────────────────┐
   Ziyaretçi ──────►│  Next.js 16 App Router (sunucu bileşenleri)│
   (anonim,        │                                           │
    hesapsız,      │  app/[lang]/                              │
    çerezsiz)      │    page.tsx            Günün özeti + şerit │
                    │    haberler/           haber akışı         │
                    │    portreler/          portre dizini       │
                    │    portre/[slug]       içerik şablonu      │
                    │    haber/[slug]        içerik şablonu      │
                    │    kategori/[slug]     kategori sayfası    │
                    │    ara/                arama + filtre      │
                    │    podcast/ bookmarks/ profile/ legal/     │
                    └───────────┬───────────────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
      lib/content.ts     lib/content-seo.ts   lib/speech-text.ts
      (birleşik model)   (JSON-LD+speakable)  (cümle bölme)
              │
              ▼
      Prisma / SQLite  ── NewsItem · Portrait · PortraitSource · PortraitCandidate
                                │
                                ▼
                    ┌───────────────────────────┐
                    │  İstemci (tek kalıcılık)  │
                    │  MediaProvider            │
                    │   · speechSynthesis       │
                    │   · tek <audio>           │
                    │  localStorage eth.v1.*    │
                    └───────────────────────────┘
```

**Akış kuralları**
- Playlist/kuyruk, ses ve metin **hiçbir sunucuya gitmez** (Web Speech API).
- Okunma sayısı yalnızca **toplu** sayaç (`/api/news/view`, `/api/portraits/:id/view`).
- Tüm tercihler `localStorage` — çerez yok, oturum yok, IP profili yok.

### State yönetimi tablosu

| Katman | Nerede | Ne tutar | Kalıcılık |
|---|---|---|---|
| URL query | `lib/portrait-query.ts`, `app/[lang]/ara` | kategori, konu tipi, tarih, sıralama, arama | Tarayıcı geçmişi (paylaşılabilir) |
| React Context | `components/DevicePrefsProvider.tsx` | tema, yazı boyutu, satır aralığı, sade okuma, okundu işareti | localStorage `eth.v1.prefs` |
| React Context | `components/media/MediaProvider.tsx` | okuma metni, cümle indeksi, durum, hız, ses, uyku, audio kuyruğu | Bellek + `eth.v1.speech` (konum) |
| Bileşen state | `StickyTitle`, `MediaBar`, `SearchForm` | scroll yüzdesi, menü açık/kapalı, yazılan metin | Yok (geçici) |
| Sunucu | Prisma | NewsItem, Portrait, kaynaklar, adaylar | SQLite (kişisel veri yok) |

### localStorage şeması (storageVersion: 1)

| Anahtar | Tip | İçerik | Silme |
|---|---|---|---|
| `eth.v1.prefs` | object | theme, fontSize, lineHeight, readingMode, readMarks, city, speechRate, speechVoice | Ayarlar → "Tüm cihaz verilerini sil" |
| `eth.v1.bookmarks` | `{storageVersion, items[]}` | id, title, url, category, savedAt | Yer imleri → "Tümünü temizle" |
| `eth.v1.read` | `{storageVersion, ids[]}` | okundu kimlikleri (`portre:<slug>`, `haber:<slug>`) | Ayarlar → "Okundu işaretlerini temizle" |
| `eth.v1.playback` | object | podcast konumu (episodeId, seconds, speed) | Oynatıcı kapatılınca |
| `eth.v1.speech` | object | contentId, sentenceIndex, rate, mode (kaldığın yer) | Okuma bitince / "Kapat" |
| `eth.v1.searches` | `{items[]}` | son 8 arama terimi | Ara → "Temizle" |
| `eth.v1.portrait-viewed` (sessionStorage) | `string[]` | oturum içi sayaç tekilleştirme | Sekme kapanınca |

Depolama engelliyse: `isStorageAvailable()` false → `StorageNotice` bilgi şeridi
görünür, özellikler zarifçe devre dışı kalır, uygulama çökmez.

---

## 2. Uygulama planı (fazlar)

| Faz | Kapsam | Neden bu sırada | Tek başına yayına alınabilir |
|---|---|---|---|
| **F1 — Şema & slug** | `NewsItem.slug`, `Portrait.slugHistory`, `lib/slug.ts`, `scripts/backfill-slugs.mjs` | Tüm URL'ler buna bağlı; geri dönüşü olmayan tek adım | Evet (backfill sonrası her şey çalışır) |
| **F2 — Sesli okuma motoru** | `lib/speech-text.ts`, `MediaProvider`, `MediaBar`, `ListenControls` | Yeni formatın "kritik" özelliği; içerik şablonundan önce hazır olmalı | Evet (eski sayfalarda da tek başına çalışır) |
| **F3 — İçerik şablonu** | `lib/content.ts`, `lib/content-seo.ts`, `ContentArticle`, `StickyTitle` | 8 bölümlü gövde + JSON-LD + speakable | Evet (`/haber/<slug>` rotaları) |
| **F4 — Bilgi mimarisi** | `SiteHeader`, `MobileNav`, `SiteFooter`, ana sayfa, `/portreler`, `/kategoriler`, `/ara` | Navigasyon ve dizinler şablonun üzerine kurulur | Evet |
| **F5 — Eski URL göçü** | `/news/[id]` → 308, `/portreler/[slug]` → 308, `/explore` → 308 | SEO değerini korur; F4 sonrası gerekli | Evet |
| **F6 — KVKK & SEO son kontrol** | sitemap/RSS/news-sitemap, robots, hukuk metinleri, çerez denetimi | Yayın kapısı | Evet |

**KVKK'ya aykırı bulunan ve kaldırılanlar (bu turda):**
- `/en` dil değiştirici çerez yazıyordu (`NEXT_LOCALE`) → kaldırıldı, dil URL'de.
- Ziyaretçi hesabı/menüsü (`UserMenu`, `AuthForms`) → kaldırıldı.
- Bildirim aboneliği formu (`NotificationSettings`) → arayüzden kaldırıldı.
- Sunucu TTS (`/api/news/:id/audio`) arayüzden çıkarıldı; sesli okuma tamamen istemcide.

---

## 3. Dosya / bileşen ağacı

```
app/
  layout.tsx                      tema bootstrap (FOUC yok) + provider'lar
  global-error.tsx                500
  robots.ts · sitemap.ts          sitemap (haber + portre + kategori)
  news-sitemap.xml/route.ts       Google News sitemap
  rss.xml/route.ts                ana RSS
  rss/[category]/route.ts         kategori RSS
  [lang]/
    layout.tsx                    SiteHeader + MediaProvider + MobileNav + MediaBar
    page.tsx                      Günün özeti · Şu an önemli · Son portreler · Son haberler
    haberler/page.tsx             haber akışı (filtre + radyo + yükle)
    portreler/page.tsx            portre dizini (kart + filtre)
    portre/[slug]/page.tsx        içerik şablonu (portre)
    haber/[slug]/page.tsx         içerik şablonu (haber)
    portreler/[slug]/route.ts     eski URL → 308
    news/[id]/route.ts            eski URL → 308
    explore/route.ts              eski URL → 308
    kategori/[slug]/page.tsx      kategori
    kategoriler/page.tsx          kategori dizini
    ara/page.tsx                  arama (URL state)
    podcast/ · blog/ · bookmarks/ · profile/ · about/ · legal/[doc]/
    admin/ · admin/x-studio/ · offline/ · auth-error/
components/
  media/MediaProvider.tsx         sesli okuma + audio durum makinesi
  media/MediaBar.tsx              kalıcı alt oynatıcı (hız, ses, uyku, karaoke)
  media/ListenControls.tsx        "Sesli özeti dinle" / "Tüm metni dinle"
  content/ContentArticle.tsx      8 bölümlü şablon
  content/StickyTitle.tsx         yapışkan başlık + ilerleme
  content/ContentBehaviors.tsx    toplu sayaç + okundu işareti
  layout/SiteHeader.tsx           üst menü (Kategoriler açılır)
  layout/MobileNav.tsx            Akış · Kategoriler · Ara · Kaydedilenler
  layout/SiteFooter.tsx           yasal linkler + dil + çerez notu
  layout/GlobalSearch.tsx         ⌘K paleti
  home/LoadMoreNews.tsx           "Daha fazla yükle"
  search/SearchForm.tsx           büyük arama alanı
  PortraitCard.tsx · PortraitFilters.tsx · NewsCard.tsx · Feed.tsx
  SaveButton.tsx · ShareButton.tsx · ReadingToolbar.tsx · HighlightText.tsx
  DevicePrefsProvider.tsx · ThemeCycleButton.tsx · CommandPalette.tsx
lib/
  slug.ts           slug üretimi (≤6 kelime, ASCII)
  content.ts        birleşik içerik modeli + sesli okuma paketi
  content-seo.ts    NewsArticle + BreadcrumbList + SpeakableSpecification
  speech-text.ts    cümle bölme, temizlik, süre tahmini
  local-store.ts    sürümlü localStorage (prefs, bookmarks, read, speech…)
  portrait-*.ts     üretim hattı, puanlama, araştırma, görsel
scripts/
  backfill-slugs.mjs · fix-portrait-covers.mjs · portrait-sample.mjs
tests/
  format.test.ts · portraits.test.ts · portrait-copyright.test.ts · push*.test.ts
```

---

## 4. Sesli okuma — state makinesi ve ayrıntılar

### 4.1 Durum makinesi

```
                 requestSpeech(doc)
   idle ───────────────────────────────► paused
    ▲                                     │  utterance.onstart
    │  stop()                             ▼
    │                                  playing ◄──────┐
    │                                     │  toggle() │ toggle()
    │                                     ▼           │
    │                                  paused ────────┘
    │                                     │  son cümle bitti
    │                                     ▼
    └────────────────────────────────  ended
```

| Durum | Anlam | `MediaBar` | Media Session |
|---|---|---|---|
| `idle` | Okuma yok | Gizli | `none` |
| `playing` | Sentez konuşuyor | Duraklat düğmesi | `playing` |
| `paused` | Durdurulmuş (konum korunur) | Oynat düğmesi | `paused` |
| `ended` | Son cümle bitti, konum temizlendi | Oynat (baştan) | `none` |

**Tek okuma kuralı:** bir doküman çalarken farklı içerik istenirse
`pendingDoc` kurulur ve onay diyaloğu açılır (`confirmSwitch` / `cancelSwitch`).

### 4.2 Cümle bölme

`lib/speech-text.ts → splitSentences()`

1. `\r\n` normalizasyonu, fazla boşluk temizliği.
2. Cümle sonu: `. ! ? …` + ardından boşluk + `Büyük harf / rakam / tırnak`.
3. Korunan kalıplar: ondalık sayı (`1.5`), kısaltmalar (`Prof.`, `Dr.`, `vb.`,
   `TBMM`, `ABD`, birimler), tek harfli baş harfler (`A. Yılmaz`).
4. 3 kelimeden kısa parçalar bir önceki cümleye eklenir.
5. Kapanış tırnağı/parantezi cümlenin parçası sayılır.

**Vurgulama (karaoke):** `utterance.onboundary` → `partialCharsRef` güncellenir,
`progress = (tamamlanan + charIndex) / toplam`. Cümle listesinde aktif satır
`aria-current="true"` + `bg-blue-500/15`. Cümleye tıklama → `jumpToSentence(i)`.

### 4.3 Hata durumları

| Durum | Tespit | Davranış |
|---|---|---|
| Tarayıcı desteklemiyor | `!("speechSynthesis" in window)` | `ListenControls` yerine uyarı; `MediaBar` hiç açılmaz |
| Türkçe ses yok | `getVoices()` içinde `lang.startsWith("tr")` boş | Ses menüsünde uyarı; varsayılan motor sesiyle okumaya devam |
| Otomatik oynatma engeli | `not-allowed` | `status = paused` + "Oynat düğmesine dokunun" mesajı |
| Senthesiz kesinti | `error = interrupted/canceled` | Hata sayılmaz (kendi iptalimiz) |
| Depolama kapalı | `isStorageAvailable()` false | Okuma çalışır, konum kaydı yapılmaz |

### 4.4 Test senaryoları

| # | Senaryo | Beklenen |
|---|---|---|
| T1 | "Sesli özeti dinle" → cümleler sırayla, karaoke ilerler | Aktif satır vurgulanır, ilerleme %0→100 |
| T2 | Duraklat → 15 sn geri → oynat | Konum ~15 sn öne gider, aynı cümleden devam |
| T3 | Hız 2x | `utterance.rate` değişir, kalan süre yarıya iner |
| T4 | Uyku 10 dk | Geri sayım görünür, süre bitince `paused` |
| T5 | Uyku "bölüm sonunda dur" | Doküman sonunda otomatik durur, sonraki içeriğe geçmez |
| T6 | Farklı içerikte okuma başlat | Onay diyaloğu; "Vazgeç" mevcut okumayı sürdürür |
| T7 | Sekme kapat → aynı içeriğe dön | "Kaldığın yerden devam et" önerisi, cümle indeksinden başlar |
| T8 | Network sekmesi açıkken okuma | **Hiçbir medya/TTS isteği yok** |
| T9 | `prefers-reduced-motion` | Animasyonlar kapanır, okuma çalışır |
| T10 | Klavye: Space / ← / → | Oynat-duraklat / 15 sn geri / 30 sn ileri |
| T11 | iOS Safari | İlk dokunuşla başlar; kilit ekranı kontrolleri görünür |
| T12 | Türkçe ses yok cihaz | Uyarı metni, okuma yine çalışır |

---

## 5. KVKK kontrol listesi

| Veri | İşleniyor mu? | Nerede | Ne kadar |
|---|---|---|---|
| Ad, soyad, e-posta, telefon | **Hayır** | — | — |
| Hesap / şifre / üyelik | **Hayır** | — | — |
| Çerez (zorunlu dahil) | **Hayır** | — | — |
| Üçüncü taraf analitik / pixel / reklam | **Hayır** | — | — |
| IP adresi (uygulama düzeyinde) | **Hayır** | — | — |
| Konum / IP tabanlı kişiselleştirme | **Hayır** | — | — |
| Ses kaydı / ses dosyası | **Hayır** | Tarayıcı yerleşik TTS | Gönderilmez |
| Okuma metni (TTS isteği) | **Hayır** | Cihaz içi sentez | Gönderilmez |
| Tema, yazı boyutu, sade okuma | Evet | `eth.v1.prefs` (cihaz) | Kullanıcı silene kadar |
| Yer imleri | Evet | `eth.v1.bookmarks` (cihaz) | Kullanıcı silene kadar |
| Okundu işaretleri | Evet | `eth.v1.read` (cihaz) | Kullanıcı silene kadar |
| Dinleme konumu | Evet | `eth.v1.speech` (cihaz) | Kullanıcı silene kadar |
| Son aramalar | Evet | `eth.v1.searches` (cihaz) | Kullanıcı silene kadar |
| Okunma sayısı | Yalnızca toplu sayaç | `NewsItem.viewCount`, `Portrait.viewCount` | Süresiz (kişisel değil) |
| AI sohbeti (varsa) | İstek süresince | Sunucu belleği | Yanıt sonrası atılır |
| Yurt dışı aktarım | **Hayır** | — | — |

**Doğrulama:** `curl -sI https://…/tr | grep -i set-cookie` → çıktı yok.
DevTools → Application → Cookies → boş; Local Storage → yalnızca `eth.v1.*`.

---

## 6. Erişilebilirlik & performans

- [x] Semantik HTML: `header/nav/main/article/section/figure/ol/ul/blockquote`
- [x] Başlık hiyerarşisi: her sayfada tek `h1`, bölümler `h2`, alt bölümler `h3`
- [x] Skip-to-content linki (`#main-content`, görünür odakta)
- [x] Görünür `:focus-visible` halkası (global CSS)
- [x] Dokunma hedefleri ≥ 44 px (`.btn-*`, oynatıcı düğmeleri, menü)
- [x] `aria-pressed` (Kaydet, filtre çipleri, sesli okuma düğmeleri)
- [x] `aria-expanded` (Kategoriler, ses/uyku menüleri, ⌘K)
- [x] `aria-live` (oynatıcı durumu, arama sonucu sayısı, filtre sonucu)
- [x] `aria-current="page"` (menü, breadcrumb, cümle vurgusu)
- [x] `aria-modal` + odak tuzağı + Esc (⌘K, filtre paneli, onay diyalogları)
- [x] `prefers-reduced-motion` desteği
- [x] `prefers-color-scheme` varsayılan tema + FOUC'suz bootstrap
- [x] Görsellerde `width`/`height`, `loading="lazy"`, `decoding="async"`
- [x] Metin satır genişliği ≤ 70 karakter (`max-w-2xl` gövde)
- [x] Türkçe tarih/saat (`28 Ekim 2025, 14:05`), `tr-TR` sayı biçimi
- [ ] AVIF/WebP srcset — görseller `/api/.../image` JPEG; varyant üretimi ayrı iş
- [ ] Lighthouse ölçümü — bu ortamda tarayıcı yok, adımlar §7'de

---

## 7. Yayın öncesi test adımları

```bash
# 1) Lighthouse (mobil) — hedef: Perf/A11y/BP/SEO ≥ 90
npx lighthouse http://localhost:3000/tr --form-factor=mobile --view
npx lighthouse http://localhost:3000/tr/portre/<slug> --view

# 2) Veri kalıntısı (gizli sekme)
#    DevTools → Application → Cookies: BOŞ
#    Local Storage: yalnızca eth.v1.prefs / bookmarks / read / speech / searches / playback
curl -sI http://localhost:3000/tr | grep -i set-cookie   # çıktı yok

# 3) Klavye testi
#    Tab → skip-link → üst menü → Kategoriler (Enter, Esc) → kart → detay
#    → "Sesli özeti dinle" (Enter) → Space → ← → → → M

# 4) Çevrimdışı testi
#    Bir haberi 5 sn aç → Network: Offline → sayfayı yenile (cache) → yeni sayfa /offline

# 5) Sesli okuma (Chrome / Safari / iOS)
#    Chrome masaüstü: cümle vurgusu, hız, uyku, klavye
#    Safari masaüstü: ses listesi (yalnızca tr-TR), pause/resume
#    iOS Safari: ilk dokunuşta başlama, kilit ekranı kontrolleri

# 6) "Ses hiçbir sunucuya gitmiyor" doğrulaması
#    DevTools → Network → filtre: Media / Fetch/XHR
#    Okuma başlat → 0 yeni istek (yalnızca sayaç POST'u sayfa açılışında bir kez)

# 7) Slug/SEO
curl -s http://localhost:3000/sitemap.xml | grep -c "/haber/"
curl -s http://localhost:3000/news-sitemap.xml | head -20
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tr/news/<eski-id>   # 308

# 8) Migration
ssh root@VPS_IP 'cd /opt/news && docker compose exec news npx prisma migrate status'
```

---

## 8. Editoryal akış (portre)

`PORTRAIT_AUTO_PUBLISH=false` (varsayılan) → üretilen portreler **inceleme**
durumunda bekler. Yayın: `/tr/admin` → **Portreler** sekmesi → "Yayınla".
Otomatik kontroller (≥3 bağımsız kaynak, kaynaklı iddia, KVKK md.6 taraması,
birebir alıntı doğrulaması, yapı zorunlulukları) geçmezse portre yayınlanmaz;
neden `reviewNotes` alanında görünür.
