# Aralık, tipografi ve yoğunluk sistemi

Bu belge, 27 Ekim 2026'da uygulanan **8 pt aralık sistemi + yoğunluk
modları + tipografik ölçek** değişikliğini belgeler. Marka kimliği (renk,
yazı tipi ailesi, kart biçimi, rozetler, sayfalar) değişmedi; yalnızca
boşluk, hizalama, tipografik ölçek ve yoğunluk yeniden düzenlendi.

## 1. Tek kaynak

| Dosya | Rol |
|---|---|
| `lib/design/tokens.ts` | **TEK KAYNAK.** Ölçek, roller, yoğunluk çarpanları, tipografi, yerleşim |
| `scripts/generate-tokens.mjs` | `app/generated/tokens.css` üretir (`predev`/`prebuild`) |
| `scripts/check-tokens.mjs` | `npm run tokens:check` — dosya kaynakla aynı mı |
| `app/generated/tokens.css` | Üretilen CSS değişkenleri (elle düzenlenmez) |
| `tailwind.config.ts` | `theme.spacing` yalnızca token anahtarlarından üretilir |

Kural: `tailwind.config.ts` içinde sayısal ölçek **tamamen** token'lara
bağlıdır. `p-3.5`, `mt-[18px]` gibi ölçek dışı sınıflar derlenmez; bu yüzden
yanlışlıkla kullanılamaz. `tests/spacing.test.ts` bunu tarar.

## 2. Token tablosu

### 2.1 Aralık ölçeği (yalnızca 11 değer)

| Token | Değer |
|---|---|
| `--space-0` | 0 |
| `--space-1` | 4 px |
| `--space-2` | 8 px |
| `--space-3` | 12 px |
| `--space-4` | 16 px |
| `--space-5` | 24 px |
| `--space-6` | 32 px |
| `--space-7` | 48 px |
| `--space-8` | 64 px |
| `--space-9` | 96 px |
| `--space-10` | 128 px |

### 2.2 Yoğunluk çarpanları

| Mod | Çarpan | Basamak kaydı | Kart içi | Kartlar arası | Bölümler arası |
|---|---|---|---|---|---|
| Sıkı (`compact`) | 1.00 | +0 | 12 px | 16 px | 32 px |
| Dengeli (`balanced`) | 1.25 | +1 | 16 px | 24 px | 48 px |
| Geniş (`comfortable`) | 1.50 | +2 | 24 px | 32 px | 64 px |

Çarpan yeni değer **uydurmaz**; ölçek basamağını kaydırır. Böylece her çıktı
4'ün katı ve izin verilen 11 değerden biridir
(`tests/tokens.test.ts` doğrular).

Varsayılan seçim: `< 768 px → Geniş`, `768–1179 → Dengeli`, `>= 1180 → Dengeli`.
Kullanıcı 3 moddan birini seçebilir; tercih `localStorage` içinde
`eth.v1.prefs.density` alanında tutulur (**çerez değil**). "Otomatik"
seçeneği görünüm genişliğine göre çözer.

### 2.3 Tipografi ölçeği

| Rol | Mobil | Masaüstü | Satır yük. | Ağırlık | Sınıf |
|---|---|---|---|---|---|
| H1 (makale başlığı) | 28 | 34 | 1.25 | 600 | `.t-h1` |
| H2 (bölüm başlığı) | 20 | 22 | 1.3 | 600 | `.t-h2` |
| H3 (kart başlığı) | 17 | 18 | 1.35 | 600 | `.t-h3` |
| Gövde | 17 | 17 | 1.55 | 400 | `.t-body` |
| Spot / açıklama | 15 | 15 | 1.5 | 400 | `.t-lead` |
| Meta | 13 | 13 | 1.4 | 400 | `.t-meta` |
| Etiket / rozet | 12 | 12 | 1.3 | 600 (+0.02em) | `.t-label` |

- Gövde 17 px tabanlıdır; kullanıcı **A−/A+** ile 16 / 17 / 19 px arasında
  geçer (`--text-step-sm|md|lg`). Yoğunluk bu değeri **değiştirmez**.
- H3 ile gövde aynı boyuttadır (17); ayrım **ağırlık ve renkle** kurulur.
- Light/Thin yok; en düşük ağırlık 400.
- Okuma kolonu `--measure: 68ch`, geniş ekranda ortalanır (`.measure`).
- Tek font ailesi (Inter + sistem yığını) korunur.

### 2.4 Yerleşim ve sabitler

| Token | Değer | Not |
|---|---|---|
| `--page-gutter-narrow` | 16 px | < 390 px |
| `--page-gutter` | 24 px | 390–1179 px (12 px'in altına inilmez) |
| `--page-gutter-wide` | 48 px | ≥ 1180 px |
| `--layout-max` | 1440 px | |
| `--rail-left` / `--rail-right` | 236 / 320 px | ≥ 1180 px |
| `--size-touch` | 44 px | WCAG hedefi |
| `--size-header` | 56 px | |
| `--size-bottom-nav` | 56 px | |
| `--bottom-nav-gap` | 24 px | içerik son kartı menünün altında kalmaz |
| `--sp-after-header` | 32 px | üst başlık → ilk kart |
| `--motion-fast` | 150 ms | `prefers-reduced-motion` ile kapanır |

## 3. Önce / sonra (12 bileşen)

| # | Bileşen | Önce | Sonra | Gerekçe |
|---|---|---|---|---|
| 1 | Haber kartı dolgusu (`NewsCard`) | `p-3.5` (14) / `sm:p-4` (16) | `.surface-card` → 24/16/12 (yoğunluk) | Kart içi ölçek tek yerden; mobilde ferah |
| 2 | Akış kartları arası (`Feed`) | `gap-3` (12) | `.feed-stack` → 32/24/16 | Bölüm değil kart ilişkisi; yoğunluğa bağlı |
| 3 | Sayfa yan boşluğu | `px-3` (12) / `sm:px-5` (20) | 16 / 24 / 48 | 12 px yasak; genişlik sınıfına bağlı |
| 4 | Kart başlığı (`h3`) | 15 px / `leading-tight` | `.t-h3` 17→18 / 1.35, 2 satır | Okunurluk + ölçek |
| 5 | Kart spotu | 15 px / 1.625 | `.t-body` 17 / 1.55 | Gövde 17 tabanı |
| 6 | Meta satırı (süre/saat/rozet) | 11–12 px | `.t-meta` 13 | Küçük metin tabanı |
| 7 | Rozet/etiket | 9–10 px, `uppercase` | `.t-label` 12, +0.02em, uppercase YOK | Brief 4: etiket büyük harf değil |
| 8 | Başlık → spot | `mt-1` (4) | `mt-title-spot` (8, sabit) | Aynı ilişki her yerde aynı |
| 9 | Spot → meta | `mt-1.5` (6) | `mt-spot-meta` (12, sabit) | Aynı ilişki her yerde aynı |
| 10 | Bölüm arası (`ContentArticle`) | `mt-5` / `mt-6` (20/24) | `mt-section-gap` 64/48/32 | Bloklar arası nefes |
| 11 | Bölüm başlığı | `text-sm font-bold uppercase` | `.section-title` (13 px meta ölçeği, 0.06em) | Sessiz başlık, çizgisiz hiyerarşi |
| 12 | Alt sabit menü | 56 px, içerik `pb-14` (56) | 56 px + `--bottom-nav-gap` 24 → `pb-bottom-nav` (80) | Son kart menünün altında kalmaz |
| 13 | Sağ kolon dikey ritmi | `space-y-4` (16) | `.rail-stack` → 32/24/16 | Kart aralığı yoğunluğa bağlı |
| 14 | Footer bağlantıları | 17 px satır yüksekliği | `min-h-touch` (44) | Dokunma hedefi |
| 15 | Paylaş ikonu | 16×16 buton | 44×44 hedef, ikon 16 | Dokunma hedefi |
| 16 | Tema düğmesi | 32×32 | 44×44 | Dokunma hedefi |

## 4. Bileşen sınıfları

```css
.page-shell        /* yan boşluk + max genişlik (48 px kenar, 1440 px) */
.layout-grid       /* 1 → 3 kolon; ≥1180: 236 / 1fr / 320, gap 32 */
.layout-rail-sticky/* ≥1180 sticky; overflow: visible (kaydırma kilidi yok) */
.surface-card      /* kart: çerçeve + yarıçap + yoğunluk dolgusu */
.feed-stack        /* kartlar arası dikey boşluk (yoğunluk) */
.rail-stack        /* yan kolon widget aralığı (yoğunluk) */
.block-stack       /* ana sayfa blokları arası (yoğunluk) */
.section-label     /* küçük, sessiz, geniş harf aralıklı başlık */
.section-body      /* başlık → içerik (16, sabit) */
.t-h1 .t-h2 .t-h3 .t-body .t-lead .t-meta .t-label
.page-gutter       /* makale sayfaları için yan boşluk */
.pb-bottom-nav     /* alt menü + güvenli alan payı */
.measure           /* 68ch okuma kolonu */
```

## 5. Kırılım şemaları

### 360 px (Geniş yoğunluk, tek kolon)

```
┌────────────────────────────────┐  16 px kenar
│ [logo]              [≡] [◐]    │  header 56
├────────────────────────────────┤
│ ▸ Günün özeti (kapalı/açık)    │  özet şeridi
│                                │  32
│ ┌────────────────────────────┐ │
│ │ @kategori        6 dk önce │ │  24 dikey / 20 yatay
│ │ Başlık 2 satır…            │ │  17 px
│ │ Spot        8              │ │
│ │ meta · 12                  │ │  13 px
│ │ [görsel 16:9]              │ │
│ │ [İşlemler]                 │ │
│ └────────────────────────────┘ │
│              32                │
│ ┌────────────────────────────┐ │
│ └────────────────────────────┘ │
│         … sonsuz …             │
├────────────────────────────────┤
│ Akış  Ara  Münazara  Kaydedil. │  56 + safe-area + 24 pay
└────────────────────────────────┘
```

### 768 px (Dengeli, sol katlanmış, sağ akışın altında)

```
┌──────────────────────────────────────────────┐  24 px kenar
│ [logo] Akış Kategoriler Portreler Haberler … │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ kart (16 dikey / 16 yatay, aralık 24)    │ │
│ └──────────────────────────────────────────┘ │
│                    …                         │
│ ┌───────────────┐ ┌───────────────┐          │
│ │ Günün özeti   │ │ Son portreler │          │  sağ kolon akışın altında
│ └───────────────┘ └───────────────┘          │
│ ┌───────────────┐ ┌───────────────┐          │
│ │ Şu an önemli  │ │ Radyo         │          │
│ └───────────────┘ └───────────────┘          │
└──────────────────────────────────────────────┘
```

### 1440 px (Dengeli, üç kolon)

```
┌──────────────────────────────────────────────────────────────────────┐ 48
│ [logo]  Akış  Kategoriler  Portreler  Haberler  Podcast  Blog  [🔍][◐]│ 56
├──────────┬──────────────────────────────────┬────────────────────────┤
│ Arama    │ ┌──────────────────────────────┐ │ Günün özeti (5)        │
│ 236      │ │ kart 16/16 · aralık 24       │ │ ─────────────────────  │
│          │ └──────────────────────────────┘ │ Şu an önemli (3)       │
│ Tümü     │            24                    │ ─────────────────────  │
│ Gündem   │ ┌──────────────────────────────┐ │ Son portreler (3)      │
│ …10      │ │ kart                         │ │ ─────────────────────  │
│          │ └──────────────────────────────┘ │ Haber Radyosu          │
│ Yoğunluk │            …                     │ ─────────────────────  │
│ Dil      │   (tek kaydırılan bölge)         │ Şeffaflık              │
│ sticky   │                                  │ sticky (320)           │
└──────────┴──────────────────────────────────┴────────────────────────┘
        gap 32                        gap 32
```

## 6. Erişilebilirlik

- [x] WCAG 2.2 AA kontrast (Lighthouse a11y **100**)
- [x] Dokunma hedefleri ≥ 44×44 (ölçüldü: istisna yalnızca `skip-link`)
- [x] Görünür odak halkası 2 px, 3:1 üzeri (`:focus-visible`)
- [x] Skip-to-content, semantik HTML, tek `h1`
- [x] Klavye sırası görsel sırayla aynı (Tab zinciri ölçüldü)
- [x] `prefers-reduced-motion`: tüm geçişler 0.01 ms
- [x] A−/A+ üç kademe (16/17/19 px), kırpma yok
- [x] Yoğunluk kontrolü: `aria-pressed`, 44 px, klavye erişimi
- [x] `safe-area-inset-bottom` alt menüde ve `main` dolgusunda

## 7. Test adımları

1. **Ekran görüntüsü:** 360 / 390 / 768 / 1180 / 1440 → kart dolgusu
   24/24/16/16/16, kart aralığı 32/32/24/24/24, bölüm arası 64/64/48/48/48,
   kenar 16/24/24/48/48.
2. **En büyük yazı (A+):** makale sayfası 360 px'te `--text-step-lg` = 19 px,
   kırpılan öğe **0**, yatay taşma **0**.
3. **Yoğunluk değişimi (CLS):** Sıkı → Geniş geçişinde `layout-shift`
   kullanıcı girdisi dışı **0.07** (< 0.1) · yazı boyutu **değişmez**
   (17 → 17).
4. **Klavye:** Tab sırası `skip-link → logo → yoğunluk → tema → içerik`;
   odak halkası `solid`.
5. **Safe-area:** alt menü `padding-bottom: env(safe-area-inset-bottom)`,
   `main` dolgusu `56 + 24 = 80 px` (ölçüldü).
6. **Token taraması:** `npx vitest run tests/spacing.test.ts` → boşluk
   sınıflarında ölçek dışı değer **0**; `npm run tokens:check` → güncel.
7. **Regresyon:** Lighthouse mobil → Performans 94 · Erişilebilirlik 100 ·
   LCP 2.5 s · CLS 0 · TBT 180 ms.

## 8. Bilinçli sapmalar

| Brief | Uygulanan | Neden |
|---|---|---|
| 390–767 px sayfa kenarı **20 px** | **24 px** | 20 px 8 pt ölçeğinde yok; kural (yalnızca 11 değer) üstün tutuldu, 12 px alt sınırı korunur |
| Mobil kart yatay dolgusu **20 px** | **24 px** | Aynı neden: 20 ölçekte yok. Dikey 24 px ile simetrik kalır |
| Alt menü etiketi "Kaydedilenler" | Görünen **"Kaydet"**, erişilebilir ad **"Kaydedilenler"** | 360 px'te 5 sekme + 12 px etiketle kırpma olmadan sığması için |
| Etiket "büyük harf yok" | `.t-label` `text-transform: none` | Bölüm başlıkları `.section-title` ile ayrı tutuldu |
| H3 ile gövde farkı ≥ 2 px | İkisi de 17 px | Brief tablosu 17/17 veriyor; ayrım ağırlıkla (600) kuruldu |
