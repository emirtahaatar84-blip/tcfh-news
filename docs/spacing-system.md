# Aralık, Yoğunluk ve Tipografi Sistemi

Bu belge example.com'nin **boşluk, hizalama, tipografik ölçek ve
yoğunluk** sistemini tanımlar. Marka kimliği (renk paleti, yazı ailesi, kart
biçimi, "Portre" ve "N kaynaktan doğrulandı" rozetleri) değişmez.

- **Tek kaynak:** `lib/design/tokens.ts`
- **Üretilen CSS:** `app/generated/tokens.css` (`npm run tokens:build`)
- **Görsel doğrulama:** `npm run visual:check` → `artifacts/visual/`
- **Tailwind bağlantısı:** `tailwind.config.ts`
- **Yoğunluk durumu:** `<html data-density="compact|balanced|comfortable">`
- **Yazı boyutu:** `<html data-font-size="sm|md|lg">`

---

## 1) Token tablosu

### 1.1 Aralık ölçeği (8 pt tabanlı)

| Token | Değer | Kullanım |
|---|---:|---|
| `--space-0` | 0 | Sıfırlama |
| `--space-1` | 4px | İkon–metin, rozet içi |
| `--space-2` | 8px | Başlık → spot, dokunma hedefleri arası |
| `--space-3` | 12px | Spot → meta, sıkı kart dolgusu |
| `--space-4` | 16px | Bölüm başlığı → içerik, dengeli kart dolgusu |
| `--space-5` | 24px | Kartlar arası (dengeli), ng rahat kart dolgusu |
| `--space-6` | 32px | Bölüm arası (sıkı), mobil kart arası |
| `--space-7` | 48px | Bölüm arası (dengeli), masaüstü kenar boşluğu |
| `--space-8` | 64px | Bölüm arası (geniş), ana sayfa blokları |
| `--space-9` | 96px | Büyük bölüm ayrımı |
| `--space-10` | 128px | Sayfa üst/alt nefesi (nadir) |

> **Tek istisna:** Brief'te mobil yan boşluk ve kart yatay dolgusu için açıkça
> 20 px istendiği için `MOBILE_GUTTER = 20` yalnızca `lib/design/tokens.ts`
> içinde tanımlıdır. Başka hiçbir dosyada 20 px yazılmaz; 390–767 px aralığında
> `--page-gutter` ve `--sp-card-x` bu sabite bağlanır.

### 1.2 Semantik roller ve yoğunluk çarpanları

Yoğunluk, ara değer üretmez: `compact` taban basamak, `balanced` +1,
`comfortable` +2 basamak ilerler. Böylece istenen tablo birebir çıkar.

| Rol | Sıkı (×1.0) | Dengeli (×1.25) | Geniş (×1.5) |
|---|---:|---:|---:|
| Kart içi dikey (`--sp-card-y`) | 12 | 16 | 24 |
| Kart içi yatay (`--sp-card-x`) | 12 (mobil 20) | 16 (mobil 20) | 24 (mobil 20) |
| Kartlar arası (`--sp-card-gap`) | 16 | 24 | 32 |
| Bölümler arası (`--sp-section-gap`) | 32 | 48 | 64 |
| Ana sayfa blokları (`--sp-block-gap`) | 32 | 48 | 64 |
| Bölüm başlığı → ilk öğe (`--sp-title-body`) | 16 | 16 | 16 |
| Kart başlığı → spot (`--sp-title-spot`) | 8 | 8 | 8 |
| Spot → meta (`--sp-spot-meta`) | 12 | 12 | 12 |
| Kolonlar arası (`--sp-column-gap`) | 32 | 32 | 32 |

Yoğunluk seçimi:

| Genişlik | Varsayılan |
|---|---|
| < 768 px | **Geniş (comfortable)** |
| 768–1179 px | **Dengeli (balanced)** |
| ≥ 1180 px | **Dengeli (balanced)** |

Kullanıcı üç moddan birini seçerse tercih `localStorage` anahtarı
`eth.v1.prefs` içinde `density` alanı olarak saklanır (çerez kullanılmaz).
"Otomatiğe dön" seçeneği yeniden genişlik tabanlı çözümlemeye geçer.

### 1.3 Yerleşim ölçüleri

| Belirteç | Değer |
|---|---:|
| `--page-gutter-narrow` (< 390) | 16px |
| `--page-gutter` (390–767) | 20px |
| `--page-gutter-tablet` (768–1179) | 24px |
| `--page-gutter-wide` (≥ 1180) | 48px |
| `--layout-max` | 1440px |
| Sol kolon / sağ kolon | 236 / 320px |
| `--size-header` | 56px + `safe-area-inset-top` |
| `--size-bottom-nav` | 56px + `safe-area-inset-bottom` |
| Alt menü içerik açıklığı | 56 + 24px |
| `--size-touch` | 44px |
| `--measure` | 68ch |

### 1.4 Tipografi ölçeği

| Rol | Mobil | Masaüstü | Satır yüksekliği | Ağırlık |
|---|---:|---:|---:|---:|
| H1 (makale) | 28 | 34 | 1.25 | 600 |
| H2 (bölüm) | 20 | 22 | 1.3 | 600 |
| H3 (kart) | 17 | 18 | 1.35 | 600 |
| Gövde | 17 | 17 | 1.55 | 400 |
| Spot | 15 | 15 | 1.5 | 400 |
| Meta | 13 | 13 | 1.4 | 500 |
| Etiket / rozet | 12 | 12 | 1.3 | 600 (+0.02em) |

- Kullanıcı A− / A+ kademeleri `--type-scale` (0.90 / 1.00 / 1.16) ile
  yalnızca **metni** büyütür; boşluklar değişmez.
- Gövde hiçbir kademede 16 px'in altına inmez (`max(1rem, …)`).
- UltraLight/Thin/Light yok. En fazla iki aile: mevcut `Inter` + sistem yazı
  tipi yığını korunur.
- Etiketler büyük harfe çevrilmez (`text-transform: none`).
- Uzun metin `68ch` ile sınırlanır ve geniş ekranda ortalanır.

---

## 2) Önce / sonra tablosu

| # | Bileşen | Önce | Sonra | Gerekçe |
|---:|---|---|---|---|
| 1 | Üst başlık yüksekliği | 56 px, safe-area yok | 56 px + `safe-area-inset-top` | Çentikli cihazda başlık kesilmesin |
| 2 | Sayfa yan boşluğu | 12 px (`px-3`) | 16 / 20 / 24 / 48 px | Mobilde daha fazla nefes, geniş ekranda 1440 hizalama |
| 3 | Üst başlık → ilk kart | 12 px (`pt-3`) | 32 px (`--sp-top-gap`) | İlk kartın birincil olduğunu boşlukla anlat |
| 4 | Kart içi dolgu | 14 px (`p-3.5`) / 16 px | 12 / 16 / 24 px (yoğunluk) | Yoğunluk moduna bağlı tek ölçek |
| 5 | Kart başlığı → spot | 10 px (`mt-2.5`) | 8 px (`--sp-title-spot`) | Aynı ilişki her yerde aynı |
| 6 | Spot → meta | 6 px (`mt-1.5`) | 12 px (`--sp-spot-meta`) | Meta'yı spot'tan ayır, başlığa yaklaştırma |
| 7 | Kartlar arası | 12 px (`gap-3`) | 16 / 24 / 32 px | Mobilde 32 px, listede 16 px |
| 8 | Bölümler arası | 16 px (`space-y-4`) | 32 / 48 / 64 px | Hiyerarşiyi çizgiyle değil boşlukla kur |
| 9 | Bölüm başlığı → içerik | 8 px (`mt-2`) | 16 px (`--sp-title-body`) | Başlık ve içerik ilişkisi netleşsin |
| 10 | Kart başlığı | 15 px / 1.25 | 17–18 px / 1.35, 600 | Okunabilirlik ve 2 satır sınırı |
| 11 | Gövde / özet | 15 px | 17 px gövde, 15 px spot | Uzun metin 17 px'in altına inmez |
| 12 | Meta / rozet | 10–11 px, uppercase | 12–13 px, uppercase yok | WCAG ve sakin hiyerarşi |
| 13 | Sol/sağ kolon | 16 px gap, sticky yok | 32 px gap, sticky + scroll kilidi yok | Üç kolon korunur, kaydırma tek bölgede |
| 14 | Mobil özet şeridi | Açık (`<details open>`) | Kapalı başlar | İlk ekranda tek birincil eylem |
| 15 | Mobil alt menü | 56 px + yarım safe-area | 56 px + `safe-area-inset-bottom` | Son kart menünün altında kalmasın |
| 16 | İçerik alt boşluğu | 56 px (`pb-14`) | 56 + 24 px + safe-area | Alt menü son kartı kapatmasın |
| 17 | Kart eylemleri (mobil) | Tümü açıkta | "İşlemler" ile katlanır | Aşamalı açığa çıkarma |
| 18 | Odak halkası | Değişken | 2 px, 3:1 üzeri | WCAG 2.2 odak görünürlüğü |
| 19 | Dokunma hedefi | 32–36 px ikonlar | ≥ 44 × 44 px | WCAG 2.2 hedef boyutu |
| 20 | Yoğunluk | Yok | 3 mod + otomatik | Kullanıcı kontrolü, localStorage |

---

## 3) Kod haritası

| Dosya | Sorumluluk |
|---|---|
| `lib/design/tokens.ts` | Tek kaynak: ölçek, roller, yoğunluk, tipografi, CSS üretimi |
| `app/generated/tokens.css` | Üretilen CSS değişkenleri (elle düzenlenmez) |
| `scripts/generate-tokens.mjs` | Üretim + `--check` doğrulaması |
| `tailwind.config.ts` | `spacing` ve `fontSize` anahtarlarını token'lara bağlar |
| `app/globals.css` | `.page-shell`, `.layout-grid`, `.surface-card`, `.t-h1…`, odak, safe-area |
| `components/layout/ThreeColumn.tsx` | 3 → 2 → 1 kolon ızgara |
| `components/layout/RailSticky.tsx` | Yalnızca sığdığında sticky; kaydırma kilidi yok |
| `components/layout/SiteHeader.tsx` | 56 px + safe-area, yoğunluk menüsü |
| `components/layout/MobileNav.tsx` | 56 px alt menü + safe-area |
| `components/layout/MobileSummaryStrip.tsx` | Kapalı başlayan özet şeridi |
| `components/layout/LeftRail.tsx` / `RightRail.tsx` | Sticky rail, bölüm etiketleri |
| `components/NewsCard.tsx` | Kart hiyerarşisi + mobil "İşlemler" |
| `components/feed/PortraitFeedCard.tsx` | Portre varyantı, aynı ritim |
| `components/PortraitCard.tsx` | Sağ kolon portre kartı |
| `components/Feed.tsx` | Akış listesi boşluğu |
| `components/settings/DensityControl.tsx` | 3 seçenek, `aria-pressed`, 44 px |
| `components/layout/DensityMenu.tsx` | Üst menüden yoğunluk erişimi |
| `components/PreferencesView.tsx` | Yoğunluk + A−/A+ + tema/okuma tercihleri |
| `components/DevicePrefsProvider.tsx` | `data-density` çözümü ve localStorage |
| `scripts/audit-spacing.mjs` | Token dışı px taraması |
| `scripts/visual-check.mjs` | 5 kırılım + yoğunluk/A+ ölçümü (CDP) |

Örnek kullanım:

```tsx
<article className="surface-card">…</article>

<div className="feed-stack">…</div>       {/* --sp-card-gap */}
<section>
  <h2 className="section-label">Gündem</h2>
  <ul className="section-body">…</ul>      {/* --sp-title-body */}
</section>

<h1 className="t-h1">…</h1>
<h3 className="t-h3 line-clamp-2">…</h3>
<p className="t-lead">…</p>
<span className="t-meta">13 px</span>
```

---

## 4) Yerleşim şemaları (metin wireframe)

### 4.1 360 px — tek kolon, Geniş yoğunluk

```
┌────────────────────────────────────────┐  ← 16 px yan boşluk (<390)
│ [logo]                    [yoğunluk][tema]│  header 56 + safe-top
├────────────────────────────────────────┤
│ ▸ Günün özeti (kapalı)            5 madde│  özet şeridi, 24 px iç
├────────────────────────────────────────┤ 32 px
│ ┌────────────────────────────────────┐ │
│ │ [avatar]  @kategori          [×]   │ │  kart içi 24/20
│ │                                    │ │
│ │ Kart başlığı en fazla iki satır    │ │  H3 17/1.35
│ │                                    │ │  8 px
│ │ Spot / açıklama 15 px              │ │  12 px
│ │ [✓ 3 kaynak] · 4 dk · 2 dk dinle   │ │
│ │ ┌────────────────────────────────┐ │ │
│ │ │            görsel              │ │ │
│ │ └────────────────────────────────┘ │ │
│ │ 124 görüntülenme        [İşlemler] │ │
│ └────────────────────────────────────┘ │
│                  ↕ 32 px               │
│ ┌────────────────────────────────────┐ │
│ │            ikinci kart             │ │
│ └────────────────────────────────────┘ │
│                  ↕ 64 px (blok)        │
├────────────────────────────────────────┤
│ Akış  Kategoriler  Ara  Münazara  Kaydet│ 56 + safe-bottom
└────────────────────────────────────────┘
   son kartın altında 56 + 24 px boşluk
```

Tek birincil eylem: kartı açmak. Paylaş/kaydet mobilde "İşlemler"
`<details>` içinde; özet şeridi kapalı.

### 4.2 768 px — tek okuma kolonu + altta 2 kolonlu rail

```
┌──────────────────────────────────────────────────────────────┐
│ header 56 px                          [yoğunluk][tema][ara] │
├──────────────────────────────────────────────────────────────┤
│                    24 px yan boşluk                          │
│  ┌──────────────────────────────┐  ┌───────────────────────┐ │
│  │ akış kartı                   │  │ akış kartı            │ │
│  └──────────────────────────────┘  └───────────────────────┘ │
│                       ↑ 24 px kart arası                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Günün özeti                                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                        ↕ 32 px                               │
│  ┌───────────────────────┐  ┌────────────────────────────┐   │
│  │ Önemli                │  │ Portreler                  │   │
│  └───────────────────────┘  └────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Radyo                                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Sol kolon üst menüdeki "Kategoriler"e katlanır. Sağ kolon akışın altına
iner ve kendi içinde iki kolon olur.

### 4.3 1440 px — üç kolon

```
┌────────────────────────────────────────────────────────────────────────────┐
│ header 56 px                                     [ara][kaydet][yoğunluk][tema]│
├────────────────────────────────────────────────────────────────────────────┤
│ 48 px │             │ 32 │                        │ 32 │             │ 48 px │
│ ┌─────┐ ┌───────────┐    │ ┌────────────────────┐   │    │ ┌─────────┐ │
│ │Ara  │ │ Akış      │    │ │ Kart               │   │    │ │Özet     │ │
│ │     │ │           │    │ └────────────────────┘   │    │ └─────────┘ │
│ │Kate-│ │ ┌─────────┐│    │         16 px           │    │ ┌─────────┐ │
│ │gori │ │ │Kart     ││    │ ┌────────────────────┐   │    │ │Önemli   │ │
│ │     │ │ └─────────┘│    │ │ Kart               │   │    │ └─────────┘ │
│ │     │ │           │    │ └────────────────────┘   │    │ ┌─────────┐ │
│ │[yoğ]│ │           │    │                          │    │ │Portreler│ │
│ └─────┘ └───────────┘    │                          │    │ └─────────┘ │
│ 236 px      1fr          │        orta kolon        │    │   320 px    │
│        sticky            │      tek kaydırılan      │    │   sticky    │
└────────────────────────────────────────────────────────────────────────────┘
```

Kolon arası 32 px, dış kenar 48 px, toplam genişlik 1440 px. Rail'ler
sticky; `overflow` kilidi yok.

---

## 5) Erişilebilirlik kontrol listesi

- [x] Metin kontrastı ≥ 4.5:1, büyük metin ≥ 3:1 (koyu ve açık tema).
- [x] Dokunma hedefleri ≥ 44 × 44 px; aralarında ≥ 8 px.
- [x] Görünür odak halkası 2 px, 3:1 üzeri (`:focus-visible`).
- [x] "İçeriğe geç" bağlantısı (`#main-content`).
- [x] Semantik `header / nav / main / aside / article / footer`.
- [x] Tek `h1`, hiyerarşik `h2 / h3`; kart başlıkları `h3`.
- [x] Yoğunluk kontrolünde `role="group"` + `aria-pressed` + erişilebilir ad.
- [x] Klavye ile tam gezinme; odak sırası DOM sırasıyla aynı.
- [x] `prefers-reduced-motion: reduce` → animasyon ve geçişler kapalı.
- [x] A− / A+ en az üç kademe; gövde 16 px'in altına inmez.
- [x] Metin %200 büyütmede yan yana öğeler dikey yığılır, kırpma yok.
- [x] Mobil alt menü ve header `safe-area-inset-*` hesaplar.
- [x] Mobilde ilk ekranda tek birincil eylem; ikincil eylemler katlanır.
- [x] `aria-live="polite"` ile yoğunluk durumu duyurulur.
- [x] Çerez yok; yalnızca `localStorage` (cihaz içi tercih).

---

## 6) Test adımları

### 6.1 Ekran görüntüsü karşılaştırması

1. `npm run dev` (token üretimi `predev` ile otomatik).
2. DevTools cihaz modunda sırasıyla **360, 390, 768, 1180, 1440 px**
   genişliklerde tam sayfa ekran görüntüsü al.
3. Kontrol:
   - 360/390: yan boşluk 16/20 px, kartlar arası 32 px, alt menü 56 px.
   - 768: tek okuma kolonu; sağ rail akışın altında 2 kolon.
   - 1180/1440: 3 kolon, kolon arası 32 px, dış kenar 48 px, rail sticky.
4. `data-density` değerini DevTools'ta değiştir; yazı boyutunun **sabit**
   kaldığını, yalnızca boşlukların değiştiğini doğrula.

### 6.2 Yazı boyutu / kırpma testi

1. Profil → Cihaz tercihleri → yazı boyutunu A+ ile en büyük kademeye getir.
2. 360 px'te kart başlığı, rozet ve meta satırlarında kırpma olmadığını
   kontrol et; başlık en fazla 2 satırda üç nokta ile kesilmeli.
3. Tarayıcı zoom %200: yan yana öğeler dikey yığılmalı; yatay kaydırma
   oluşmamalı.

### 6.3 Yoğunluk değişimi ve CLS

1. Chrome DevTools → Performance → "Layout Shift" kaydı başlat.
2. Sıkı → Dengeli → Geniş geçişlerini yap.
3. Beklenen: metin boyutu değişmez; yalnızca `gap`/`padding` değişir.
   Görsel yüksekliği sabit olduğu için CLS < 0.1. Kart yüksekliği değişen
   akışlarda `IntersectionObserver` tabanlı sanallaştırma yeniden ölçer.

### 6.4 Klavye gezinme

1. `Tab` ile: skip-link → logo → menü → yoğunluk → tema → kart başlığı →
   kart eylemleri → alt menü.
2. Her odakta 2 px halka görünür olmalı; `Enter/Space` ile yoğunluk
   seçenekleri değişmeli; `Escape` yoğunluk menüsünü kapatmalı.
3. `Shift+Tab` ile geri dönüşte sıra bozulmamalı.

### 6.5 Safe-area testi

1. iPhone 14 Pro / çentikli emülasyonda (`viewport-fit=cover` gerekli)
   üst başlığın çentiğin altında, alt menünün home indicator'ın üstünde
   olduğunu doğrula.
2. Sayfanın en altına kaydır: son kart alt menünün altında kalmamalı
   (56 + 24 px + inset).

### 6.6 Token dışı px taraması

```bash
npm run tokens:check     # üretilen CSS kaynakla aynı mı?
npm run spacing:audit    # ham px / ölçek dışı aralık sınıfı var mı?
npm run visual:check     # 360/390/768/1180/1440 + A+ + yoğunluk ölçümü
```

`visual:check`, `npm run dev` açıkken çalışır; çıktı `artifacts/visual/`
altına PNG ve `report.json` yazar. Rapor şu alanları doğrular: `pageGutter`,
`cardPadY/X`, `cardGap`, `sectionGap`, `h3`, `overflowX`, `clipped` ve
yoğunluk geçişinde `before/after` yazı boyutu (aynı olmalı).

`spacing:audit`, `app/generated/tokens.css` ve ölçüm amaçlı `1px/2px`
çizgileri hariç tutar; aralık sınıflarında `[18px]`, `[22px]`, `p-3.5`
gibi değerleri raporlar.
