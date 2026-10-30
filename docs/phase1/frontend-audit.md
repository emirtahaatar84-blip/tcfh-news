# Faz 1 — Frontend Keşif Raporu (Frontend Audit)

> **Tarih:** 22 Ekim 2026 · **Canlı:** http://localhost:3000 · **Kapsam:** `app/**`, `components/**`, `proxy.ts`, tasarım sistemi, i18n, erişilebilirlik, performans.
> **Kural:** Bu faz yalnızca keşiftir — hiçbir uygulama kodu değiştirilmedi, build alınmadı.

---

## İçindekiler

1. [Sayfa Envanteri](#1-sayfa-envanteri)
2. [Bileşen Envanteri](#2-bileşen-envanteri)
3. [Tasarım Sistemi Dökümü](#3-tasarım-sistemi-dökümü)
4. [Erişilebilirlik Gözlemi](#4-erişilebilirlik-gözlemi)
5. [Performans Gözlemi + Lighthouse Baseline](#5-performans-gözlemi--lighthouse-baseline)
6. [Eksik Analizi (10 Fazlı Yol Haritası)](#6-eksik-analizi-10-fazlı-yol-haritasına-göre)

---

## 1. Sayfa Envanteri

### 1a. `app/[lang]/**` Sayfaları

Toplam **13 sayfa rotası** (+ 3 yardımcı dosya: `error.tsx`, `loading.tsx`, `not-found.tsx`).

| Yol | Amaç | Sunucu/İstemci | Veri Kaynağı | `force-dynamic` | noindex? | Notlar |
|---|---|---|---|---|---|---|
| `/[lang]` (`page.tsx`) | Ana haber akışı (feed) | Sunucu (içinde `Feed` istemci) | Prisma `newsItem.findMany` (PAGE_SIZE=10+1), `getSubTopicTags(8)` | ✅ Var | Koşullu: `?q=` arama ve `?bookmarks=1` → noindex; kategori sayfası indekslenir | `?category=`, `?q=`, `?bookmarks=1` query'leri. Sticky kategori çubuğu (`top-12 lg:top-0`) + alt-konu etiket çubuğu. `Feed` bileşenine `key` ile category/query/bookmarks değişiminde remount |
| `/[lang]/news/[id]` | Haber detayı | Sunucu (+ `AudioSummary`, `ViewTracker`, `RemoveNewsButton` istemci) | Prisma `newsItem.findUnique` | ✅ Var | Hayır (indekslenir) | ID regex `^[a-zA-Z0-9]{5,40}$`. `removedAt !== null` → `notFound()`. Video haberi: 16:9 YouTube iframe (`loading="lazy"`); normal: `<img>` (next/image **kullanılmıyor**). Gövde: `MarkdownContent`, altında TTS `AudioSummary`, çok-kaynak sentez rozeti, sahibine özel `RemoveNewsButton` |
| `/[lang]/explore` | Keşif | Sunucu | — | ✅ Var | ✅ noindex | **Boş stub** — `ComingSoon` placeholder |
| `/[lang]/blog` | Blog | Sunucu | — | ✅ Var | ✅ noindex | **Boş stub** — `ComingSoon` placeholder (yol harikatasında Blog UI fazı bekliyor) |
| `/[lang]/assistant` | AI asistan | Sunucu | — | ✅ Var | ✅ noindex | **Boş stub** — `ComingSoon` placeholder |
| `/[lang]/achievements` | Başarılar | Sunucu | — | ✅ Var | ✅ noindex | **Boş stub** — `ComingSoon` placeholder |
| `/[lang]/profile` | Profil | Sunucu → `ProfileView` (istemci) | `useSession` (Auth.js) | ✅ Var | ✅ noindex | Girişsiz: `AuthForms` + `GoogleLoginButton`; girişli: profil bilgileri + `VoicePicker` (TTS sesi) + çıkış |
| `/[lang]/podcast` | Podcast bölümleri | Sunucu (tamamen, kartlar dahil) | Prisma `podcastEpisode.findMany` (status=published, take 50) | ✅ Var | Hayır — bilinçli: "herkese açık sayfa, noindex gerekmiyor" yorumu | Bölüm kartı: mod/kategori chip'i, konuşmacı listesi, `<audio controls preload="none">`. Senaryo metni istemciye **asla** gönderilmez (`serializePublicPodcastEpisode`) |
| `/[lang]/legal/[doc]` | KVKK / Şartlar / Telif | Sunucu | Yalnızca i18n sözlüğü | ✅ Var | Hayır (indekslenir) | `DOCS = ["kvkk","terms","copyright"]` beyaz liste; dışı → 404. İçerik sözlükten (tr.json/en.json) geliyor — veritabanı yok |
| `/[lang]/about` | Hakkımızda | Sunucu | Yalnızca i18n sözlüğü | ✅ Var | Hayır (indekslenir) | AdSense onayı / ziyaretçi şeffaflığı açıklaması; `dict.legal.about` bölümünden render |
| `/[lang]/admin` | Yönetim paneli | Sunucu kapı + `AdminDashboard` (istemci) | Prisma: settings, rssSource listesi, newsCount, activeSourceCount | ✅ Var | ✅ noindex (+ proxy `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store, private`) | `?tab=rss` gibi derin bağlantı: `initialTab` prop'u → `VALID_TABS` kontrolü. 7 sekme: general, rss, llm, actions, video, podcast, moderation |
| `/[lang]/admin/x-studio` | X (Twitter) post atölyesi | Sunucu kapı + `XStudio` (istemci) | Prisma `xStyle.findMany`; geri kalan API'den | ✅ Var | ✅ noindex | Yalnızca owner oturumu (admin/layout kapısı). Klavye kısayolları: **G/J/K/1/2/3/C/P** |
| `/[lang]/auth-error` | Auth.js hata sayfası | Sunucu | — | ✅ Var | ✅ noindex | `?error=` koduna göre Türkçe açıklama (AccessDenied, OAuthAccountNotLinked, Verification). **Metinler kod içine gömülü** — i18n sözlüğünde değil |

**Stub özeti:** `explore`, `blog`, `assistant`, `achievements` = 4 sayfa `ComingSoon` ile boş. `blog` görevde sorulduğu gibi **evet, boş stub'dur**.

### 1b. Yardımcı Rotalar ve Metadata Dosyaları

| Dosya | Amaç | Notlar |
|---|---|---|
| `app/sitemap.ts` | Sitemap üretimi | `force-dynamic`. `/tr`, `/en` + son 200 haber × 2 dil = ~402 URL. DB hatasında yalnızca statik girişler döner (try/catch) |
| `app/robots.ts` | Robots kuralları | `disallow: /tr/admin, /en/admin, /api/`; sitemap + host bildirimi. `force-dynamic` |
| `app/not-found.tsx` | Kök 404 | `x-locale` başlığından locale çözer, sözlükten çevirir |
| `app/[lang]/not-found.tsx` | Locale 404 | Aynı deseni locale altında tekrarlar |
| `app/[lang]/loading.tsx` | Feed iskeleti | 4 kartlık `animate-pulse` iskelet, `aria-hidden` |
| `app/[lang]/admin/loading.tsx` | Admin iskeleti | İstatistik kutuları + panel iskeleti |
| `app/[lang]/error.tsx` | Hata sınırı | **`"use client"`** — tek istemci route dosyası |

### 1c. Layout Zinciri (root → [lang] → admin koşullu düzen)

```
app/layout.tsx (root)
 └─ app/[lang]/layout.tsx (3 kolonlu tema VEYA admin tam genişlik)
     └─ app/[lang]/admin/layout.tsx (owner kapısı)
         └─ app/[lang]/admin/page.tsx | x-studio/page.tsx
```

1. **`app/layout.tsx`** — `force-dynamic`. `resolveLocale(x-locale başlığı)` ile `<html lang>` belirler, `class="dark"`, `AuthProvider` (SessionProvider) ile sarar. Google Search Console doğrulama meta etiketi burada (kaldırılmamalı). Temel `metadata.robots: index, follow`.
2. **`app/[lang]/layout.tsx`** — `force-dynamic`. Metadata üretir (metadataBase, canonical `/{lang}`, `alternates.languages` tr/en, OpenGraph, Twitter). Sonra **koşullu düzen**:
   - `headers().get("x-admin-page") === "1"` ise → 3 kolonlu temaya hiç girmez; yalnızca `<div class="min-h-screen bg-[#0b0c0f]">{children}</div>` döner (admin'in kendi tam genişlikli koyu düzeni).
   - Aksi halde → 3 kolon: `Sidebar` (240px, xl:280px) | orta kolon (`MobileTopBar` + `<main>`, `lg:border-x`) | `RightSidebar` (350px, xl:380px). Veri: sözlük + `getSettings()` + `getTrendingTags(6)` + `auth()` paralel (`Promise.all`).
   - `ownerUser` hesaplanır (`role === "owner"` veya `isOwner(email)`) → `MobileTopBar`/`RightSidebar`'a `showAdminLink`.
3. **`app/[lang]/admin/layout.tsx`** — `force-dynamic`. **Owner kapısı:** `isOwnerEmail(session?.user?.email)` değilse `AdminLogin` ekranı döner; owner ise `children` render edilir. Not: Basic Auth kaldırılmış, yetki oturum bazlı.

**proxy.ts `x-admin-page` mekaniği:** Proxy (Next 16'da middleware yerine `proxy.ts`) her yerel-yönlendirilmiş istekte çalışır: locale yoksa çerez (`NEXT_LOCALE`) veya `DEFAULT_LOCALE` (tr) ile `/{locale}/...`'e redirect eder. `/{lang}/admin/*` yollarında istek başlıklarına `x-admin-page: 1` **ekler ve bunu `[lang]/layout.tsx`'e taşır** (`NextResponse.next({ request: { headers } })`) — layout bu başlıkla admin sayfalarını 3 kolonlu temadan ayırır. Aynı zamanda admin yanıtlarına `Cache-Control: no-store, private` ve `X-Robots-Tag: noindex, nofollow` ekler; tüm yanıtlara `x-locale` + `Content-Language` koyar. Matcher: `api`, `_next/static`, `_next/image`, favicon, robots.txt, sitemap.xml ve dosya uzantılı yollar hariç.

---

## 2. Bileşen Envanteri

Toplam **35 bileşen dosyası** (26 kök + 8 `admin/` + 1 `xstudio/`; `icons.tsx` yardımcı modül dahil 36 dosya). 27 dosyada `"use client"` var — **bileşenlerin ~%74'ü istemci bileşeni** (ancak çoğu ince sarmalayıcı; ağır liste/kart render'ı sunucuda).

### 2a. Kök Bileşenler (`components/`)

| Bileşen | Tür | Açıklama |
|---|---|---|
| `Sidebar` | Sunucu | Sol sabit kenar çubuğu: logo + `SidebarNav` + dil düğmesi + `UserMenu`. `lg:flex` altında gizli |
| `SidebarNav` | İstemci | **Kritik.** Aşağıda detay |
| `MobileTopBar` | Sunucu | **Kritik.** Aşağıda detay |
| `RightSidebar` | Sunucu | **Kritik.** Aşağıda detay |
| `NewsCard` | İstemci (`memo`) | **Kritik.** Aşağıda detay |
| `Feed` | İstemci | Sonsuz kaydırma: IntersectionObserver sentinel + `fetch /api/news` sayfalama; yerel imleme/daraltma state'i; boş/hata durumları |
| `CategoryTabs` | Sunucu | Kategori sekmeleri (`?category=`), handle etiketli |
| `SubTopicsBar` | Sunucu | Alt-konu etiket çubuğu (`?q=` aramasına bağlanır) |
| `SearchBar` | İstemci | Canlı arama girişi (`?q=`); rounded-full, odak halkası mavi |
| `ShareButton` | İstemci | `navigator.share` + panoya kopyalama yedeği |
| `TimeAgo` | İstemci | Göreceli zaman ("2 sa"); hidrasyon güvenli (mount sonrası) |
| `LanguageToggle` | İstemci | TR/EN geçişi; `NEXT_LOCALE` çerezi + yol değişimi |
| `SiteLogo` | Sunucu | Site adını TLD'den böler, soneki renklendirir ("news" + ".example.com") |
| `UserMenu` | İstemci | Oturumlu: avatar + çıkış; oturumsuz: `GoogleLoginButton` |
| `AuthProvider` | İstemci | `SessionProvider` sarmalayıcısı (root layout'ta) |
| `AuthForms` | İstemci | **Kritik.** Aşağıda detay |
| `GoogleLoginButton` | İstemci | **Kritik.** Aşağıda detay |
| `AdminLogin` | İstemci | Admin kapısının giriş ekranı (kalkan ikonu + Google düğmesi + geri bağlantısı) |
| `ProfileView` | İstemci | Profil sayfası gövdesi: oturum yoksa `AuthForms`+Google, varsa profil + `VoicePicker` + çıkış |
| `VoicePicker` | İstemci | VoxCPM2 ses persona listesi; kişi başına önizleme çalma (cache'li) + `PUT /api/user/voice` |
| `AudioSummary` | İstemci | **Kritik.** Aşağıda detay |
| `MarkdownContent` | Sunucu | Bağımlılıksız minimal Markdown (##/###, madde işareti, **kalın**, [link]) — AI gövde render'ı |
| `ViewTracker` | İstemci | Detay sayfası görüntüleme sayacı (`POST /api/news/view`, fire-and-forget, AbortController) |
| `RemoveNewsButton` | İstemci | Sahibe özel sessiz kaldırma düğmesi (`POST /api/news/[id]/remove`); yalnız owner oturumunda görünür |
| `ComingSoon` | Sunucu | Ortak "yakında" placeholder'ı (4 sayfa kullanıyor) |
| `icons.tsx` | — | 33 el yapımı SVG ikon modülü (aşağıda §3) |

### 2b. Admin Bileşenleri (`components/admin/`)

Ortak desen (VideoNewsManager/PodcastStudio/ModerationPanel): **4 sn polling, alt-orta toast, `animate-pulse-soft` iskelet, kart `border-border/70 bg-[#080808]`**.

| Bileşen | Satır | Açıklama |
|---|---|---|
| `AdminDashboard` | 225 | **Kritik.** Aşağıda detay |
| `GeneralSettingsForm` | 90 | Site adı vb. genel ayar formu (`field`/`btn-primary` sınıfları) |
| `RssManager` | 296 | RSS kaynak CRUD (kategori ataması, aktif/pasif) |
| `LlmSettingsForm` | 181 | LLM sağlayıcı/anahtar ayarları |
| `FetchPanel` | 194 | Manuel fetch/process tetikleme paneli |
| `VideoNewsManager` | 656 | **Kritik.** Aşağıda detay |
| `PodcastStudio` | 1096 | **Kritik.** Aşağıda detay |
| `ModerationPanel` | 615 | **Kritik.** Aşağıda detay |

### 2c. X Studio (`components/xstudio/`)

| Bileşen | Satır | Açıklama |
|---|---|---|
| `XStudio` | 892 | **Kritik.** Aşağıda detay. İç ağaç: ArticleList (J/K gezinme) + SettingsPanel (stil/ton/uzunluk/emoji/link/rozet) + VariantsPanel (3 varyant, 1/2/3 seçim) + DraftPool (kayıtlı taslaklar) |

### 2d. Kritik Bileşen Detayları

**`SidebarNav` (owner kısayolları mekaniği):** İstemci; `useSession` ile oturumu okur ve `ownerUser = session.user.role === "owner" || isOwner(email)` hesaplar. Normal 8 öğe (feed, blog, explore, podcast, assistant, bookmarks, achievements, profile) herkese; **owner'a ek 3 kısayol listenin en üstüne eklenir**: Yönetim (`/admin`), X Stüdyo (`/admin/x-studio`), RSS Kaynakları (`/admin?tab=rss` — sekme derin bağlantısı). Owner kısayolları ile feed arasında ayırıcı çizgi. Aktif öğe `bg-white/10 text-zinc-100`, pasif `text-zinc-400 hover:bg-white/5`. `aria-current="page"` aktif öğeye konur. Bookmarks öğesi `?bookmarks=1` query'sini `useSearchParams` ile izler (aktiflik `bookmarks === "1"`).

**`NewsCard`:** `memo`'lu istemci bileşeni. Kartın tamamı tıklanabilir (`router.push(detay)`, iç düğmeler `stopPropagation` — paylaşılan span'de `onKeyDown` da durdurulur). Kategori baş harfleri avatarı (renk `avatarClassesFor`), handle + `TimeAgo`, video rozeti / "✓ N Kaynaktan Doğrulandı" rozeti, özet, lazy `<img>`, alt bilgi: görüntülenme + paylaş + imleme (`aria-pressed`) + daralt (X). **Gerçek okuma sayacı:** IntersectionObserver ile kart %60+ görünür + sayfa görünür + 1 sn bekleme → `POST /api/news/view`; oturumda bir kez (`localStorage` `news:viewed-news`). İmeler `localStorage` `BOOKMARKS_KEY`'de, `storage` + özel event ile senkron.

**`MobileTopBar`:** `lg:hidden` sticky üst çubuk (h-12): logo + `LanguageToggle` + (owner'a) ayarlar ikonu. `showAdminLink` prop'u `[lang]/layout.tsx`'te sunucuda hesaplanan owner bilgisini alır — istemcide sızma yok.

**`RightSidebar`:** Sağ sabit kolon (350/380px, `lg:block`): yuvarlak arama girişi, "İlginizi Çekebilir" trend widget'ı (sıra numarası + #etiket + sayaç çipi; boşken `animate-pulse-soft` iskelet) ve hukuki alt bilgi (about/kvkk/terms/copyright + telif + e-posta). Owner'a sağ altta ayarlar kısayolu.

**`XStudio`:** Yayınlanmış haberlerden X postu üretir — otomatik API gönderimi yok, kullanıcı kopyalar. Üretim asenkron job: `POST /api/x-studio/generate` → 1.5 sn polling (120 sn timeout). **Klavye kısayolları** (`window.addEventListener("keydown")`, input/textarea/select/contentEditable hedefli ve modifier'lı tuşlar hariç): **G** üret, **J/K** listede ileri/geri, **1/2/3** varyant seç, **C** kopyala, **P** taslak havuzuna at.

**`AdminDashboard` (sekme sistemi):** `type Tab = "general" | "rss" | "llm" | "actions" | "video" | "podcast" | "moderation"`; `VALID_TABS` beyaz listesi `initialTab` query değerini doğrular (geçersizse `"general"`). Sekmeler `useState` ile client-side geçilir (rota değişmez — `?tab=` yalnızca başlangıçta okunur). Sekme çubuğu yatay kaydırılabilir `nav[aria-label]`, aktif sekme `aria-current="page"`. `ModerationPanel`'e **`onNavigateTab={(next) => setTab(next)}`** verilir — "Potkes'e Çevir" aksiyonu podcast sekmesine atlar.

**`VideoNewsManager`:** YouTube URL doğrulama (host beyaz listesi, zod yok) → `POST /api/video-news` → 4 sn polling → genişleyen kart: markdown önizleme, yayınlama/kaldırma, retry, silme. Toast + iskelet ortak deseni.

**`PodcastStudio` ("Potkes"):** Akış: mod/kategori/konu formu → `POST /api/podcast` (processing) → polling → **taslak editörü** (TEK yazma alanı — tüm bülten metni, 6000 karakter üst sınırı, `PUT .../script`; eski tur bazlı düzenleme ve `POST .../regenerate` kaldırıldı) → ses üretimi (`POST .../audio`, tüm metin TEK TTS isteğinde sentezlenir — ses akışı boyunca tutarlı) → **karakter sesi seçici**: `PODCAST_VOICES` (voiceKey) → **oynatma kilidi**: `<audio>` ilk çalmada (`onPlay` → `handleAudioPlay`) `POST /api/podcast/{id}/play`'i bir kez çağırır (`playedAt` işaretlenir; `playClaimedRef` çift çağrıyı önler; publish bu işaretleme gerektirir — 403) → `POST .../publish` → herkese açık sayfa linki.

**`ModerationPanel`:** A) En İyi Haberler: saatlik `gemma-audit` önerileri (kalite puanlı); en az 2 seç → "Potkes'e Çevir" (`POST /api/podcast` custom mod) → `onNavigateTab("podcast")`. B) Kaldırılan Haberler: yumuşak kaldırma listesi + geri yükleme (`POST /api/admin/moderation/restore`). Denetim durumu göstergesi (çalışıyor/son sonuç sayıları).

**`AuthForms` / `GoogleLoginButton`:** `AuthForms` — e-posta+şifre giriş/kayıt (mod değiştirme); kayıt `POST /api/auth/register` (EMAIL_TAKEN/WEAK_PASSWORD/INVALID_EMAIL hata eşlemeleri sözlükten), sonra `signIn("credentials", { redirect: false })`. `GoogleLoginButton` — `signIn("google", { callbackUrl })` sarmalayıcısı; `googleEnabled` false ise "yapılandırılmadı" notu gösterir.

**`AudioSummary` (TTS widget'ı):** "Sesli Özet" — `/api/news/{id}/audio` (voxcpm2, sunucuda bir kez üretilip cache'lenir; ilk dokunuş birkaç sn sürebilir). Özel oynat/duraklat düğmesi + ilerleme çubuğu; `playing/paused/ended/loadedmetadata/error/timeupdate` olay dinleyicileriyle durum yönetimi, hata durumunda Türkçe uyarı.

---

## 3. Tasarım Sistemi Dökümü

### 3a. Renk Paleti (`tailwind.config.ts` + `globals.css`)

Tailwind v3 (config tabanlı, `content` taraması app+components+lib). Açık tema yok — `:root { color-scheme: dark }`, koyu tema tek seçenek.

| Token | Değer | Kullanım |
|---|---|---|
| `background` | `#0e0f12` | Sayfa zemini (body, sidebar, orta kolon) |
| `surface` | `#16181c` | Kart/panel zemini |
| `surface-alt` / `border` | `#22252a` | Kenarlıklar (kartlar, ayırıcılar, iskelet blokları); hover kenar `#31363e` |
| `muted` | `#a1a1aa` (zinc-400) | İkincil metin (token adı; kodda çoğunlukla `text-zinc-400` direkt kullanılır) |
| `accent` | `#3b82f6` (blue-500) | Odak halkaları, linkler, vurgular |
| `accent-strong` | `#2563eb` (blue-600) | Birincil düğme zemini (`.btn-primary`) |
| `gold` | `#facc15` (yellow-400) | Kategori vurguları |

Admin bölgesinde ek koyu katmanlar (yalnızca `bg-[...]` hazır değer olarak): `#080808` (admin kart zemini), `#0b0c0f` (admin layout zemini).

**Metin katmanları:** `text-zinc-50` (başlık), `text-zinc-100` (birincil gövde), `text-zinc-200/300` (paragraf/etiket), `text-zinc-400` → `text-muted` (ikincil), `text-zinc-500` (üst veri/zaman), `text-zinc-600` (en soluk — e-posta). **Kategori vurguları** `lib/categories.ts`'ten sınıf fabrikalarıyla: `accentClassesFor`, `avatarClassesFor`, `badgeClassesFor` (emerald/sky/violet/amber/rose/… `/25` kenar + `/10` zemin + 300-400 ton metin deseni). Durum renkleri aynı deseni izler (emerald=doğrulandı, rose=video, blue=bilgi, amber=uyarı).

### 3b. Tipografi

- **Font:** `fontFamily.sans = ["Inter", "system-ui", "-apple-system", …]`. **`next/font` kullanılmıyor**, HTML'de Google Fonts bağlantısı da yok → Inter yalnızca ziyaretçide kuruluysa yüklenir; aksi halde sistem yığınına düşer (FOUT riski yok ama marka tutarlılığı belirsiz).
- **Boyut ölçeği (kullanım sıklığı):** `text-sm` 112×, `text-xs` 83×, `text-[11px]` 27×, `text-lg` 14×, `text-[15px]` 12×, `text-2xl` 10×, `text-xl` 6×, `text-base` 5×, `text-[10px]` 2×, `text-[13px]` 1×. Aralıklı değerler (`text-[15px]`, `text-[11px]`, `text-[10px]`) Tailwind ölçeğinin dışına çıkıyor — tutarsızlık kaynağı.
- Başlık hiyerarşisi: sayfa `text-2xl font-extrabold tracking-tight`, haber başlığı `text-xl sm:text-2xl font-bold`, kart başlığı `text-[15px] font-semibold`.

### 3c. Yardımcı Sınıflar (`@layer components`, globals.css)

| Sınıf | Tanım | Not |
|---|---|---|
| `.field` | `w-full rounded-xl border-[#22252a] bg-[#16181c] px-3.5 py-2.5 text-[15px]` + mavi odak halkası, disabled opaklığı | Tüm form girişleri (admin formları, arama hariç) |
| `.field-label` | `mb-1.5 block text-sm font-medium text-zinc-300` | Form etiketi |
| `.btn-primary` | `rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold` + hover/odak halkası | Birincil eylem |
| `.btn-secondary` | `rounded-full border bg-white/5 px-4 py-2 text-sm font-semibold` | İkincil eylem |
| `.admin-card` | `rounded-2xl border-[#22252a] bg-[#16181c] p-5 sm:p-6` | Admin panel kartları |
| `.chip` | `inline-flex gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold` | Etiket/rozet (renk tonları çağrı yerinden) |

Not: görevde adı geçen `.card` sınıfı **yok** — genel kart deseni inline `rounded-2xl border border-[#22252a] bg-[#16181c] p-4 sm:p-5` olarak tekrarlanıyor (DRY adayı).

### 3d. Boşluk / Yuvarlama Desenleri

- Yuvarlama: kartlar `rounded-2xl`, girişler/iç bloklar `rounded-xl`, düğme/çipler `rounded-full`. Tutarlı bir hiyerarşi.
- Dolgu: kart `p-4 sm:p-5`, admin kart `p-5 sm:p-6`, içerik sütunu `px-3 sm:px-5` (legal/about/podcast `px-4 sm:px-6` — küçük tutarsızlık). Dikey ritim `mt-`/`space-y-` 2–6 aralığıyla.
- Kenar çubukları: sol 240px (xl:280px), sağ 350px (xl:380px), orta kolon `min-w-0 flex-1 lg:border-x`, toplam `max-w-[1280px]` — 3 kolonlu Kantan/X düzeni.

### 3e. İkon Sistemi (`components/icons.tsx`)

- **33 el yazımı SVG**, dış bağımlılık (lucide vb.) yok. Hepsi `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.8"` (check `2`), `strokeLinecap/Linejoin="round"` — Lucide deseni.
- Hepsi `aria-hidden="true"` ile varsayılanlanmış (dekoratif kabul) — anlamlı ikonlarda çağrı yerinde `aria-label`/`title` ile telafi ediliyor.
- Props: `SVGProps<SVGSVGElement>` yayılımı → boyut `className="h-4 w-4"` ile.

### 3f. i18n Yapısı

- `lib/i18n-config.ts`: `locales = ["tr", "en"]`, `defaultLocale = "tr"`, `resolveLocale`, `otherLocale`.
- `lib/i18n.ts`: dinamik `import("@/locales/{tr,en}.json")`; **`Dictionary` tipi `tr.json`'dan türetilir** (`Awaited<ReturnType<typeof dictionaries.tr>>`) → eksik anahtar derleme hatası verir.
- **Simetri kontrolü (yapıldı):** tr.json ve en.json **379 iç (yaprak) anahtar**, birebir aynı anahtar kümesi — **simetrik, eksik yok.**
- Tüm UI metni sözlükten akar; **istisnalar:** `app/[lang]/auth-error/page.tsx` başlık/açıklamaları (4 blok Türkçe, kod içine gömülü — EN'de de Türkçe kalır) ve root layout sabit başlığı `"Mikro Haber"`.

---

## 4. Erişilebilirlik Gözlemi

### 4a. Dokunma Hedefleri (min 44px hedefi)

- **İyi:** `.btn-primary` (px-5 py-2.5 + text-sm ≈ 40px yükseklik — sınırda), `SidebarNav` öğeleri (px-3 py-2.5 + 20px ikon ≈ 44px), `field` (py-2.5 ≈ 42px).
- **Riskli:** ikon düğmeleri `p-1.5` + `h-4 w-4` ikon = **~26px dokunma alanı** (NewsCard imleme/kapatma, MobileTopBar admin ikonu, RightSidebar admin ikonu, Feed sayfa düğmeleri). 44px hedefin belirgin altında; mobilde daraltma/imleme hataları beklenir. Podcast bölümündeki `<audio controls>` yerel oynatıcı (h-10) kabul edilebilir.

### 4b. aria Kullanımı (sayısal tarama, app + components)

| Öznitelik | Adet | Değerlendirme |
|---|---|---|
| `aria-hidden` | 60 | Dekoratif ikon/ayraçlar tutarlı şekilde gizlenmiş ✅ |
| `aria-label` | 28 | İkon düğmeleri, nav/section'larda iyi kullanım ✅ |
| `aria-current` | 2 | `SidebarNav` linkleri + `AdminDashboard` sekmeleri (butonda `aria-current="page"` — teknik olarak `aria-pressed` veya `role="tab"` daha doğru olurdu) ⚠️ |
| `aria-pressed` | 6 | İleme düğmesi vb. ✅ |

İyi örnekler: `NewsCard` imleme düğmesi (`aria-pressed` + duruma göre `aria-label`), `CategoryTabs`/`SubTopicsBar` `aria-label`, loading iskeletleri `aria-hidden`.
Eksikler: `XStudio` varyant seçimi ve AdminDashboard sekmeleri `role="tablist"/"tab"` olmadan buton; `Feed` sonsuz kaydırma `aria-live` bölgesi yok; `NewsCard`'ın tıklanabilir `<article>`'ı klavye ile etkinleştirilebilir bir role sahip değil (iç link mevcut ama `role/tabIndex` yok); `TimeAgo` sadece göreceli metin (tam tarih `title`'da değil).

### 4c. Renk Kontrastı Riskleri

- `text-zinc-500` (#71717a) `#16181c` zemin üzerinde ≈ **4.6:1** — normal metin için sınırda, `text-xs` (12px) küçük metinde riskli (WCAG AA küçük metin 4.5:1 zorunlu; 27 adet `text-[11px]` + 2 adet `text-[10px]` kullanımı bunu aşıyor).
- `text-zinc-600` (#52525b) e-posta/üst veri ≈ **2.9:1 — başarısız** (RightSidebar iletişim satırı).
- Admin istatistik etiketleri `text-muted text-[11px]` koyu `#080808` zeminde ≈ 8:1 ✅ (koyu zemin kontrastı iyi).
- Çip rozetlerinde `/10` opaklıkta zemin + 300–400 ton metin: çoğu geçer, `text-rose-400`/`text-emerald-400` küçük puntoda sınırda.

### 4d. Klavye Kısayolları

- **X Studio** (`components/xstudio/XStudio.tsx`, satır ~360–406): `window` keydown dinleyicisi; input/textarea/select/contentEditable hedefli ve Ctrl/Meta/Alt basılıyken devre dışı ✅. **G**=üret, **J/K**=liste gezinme, **1/2/3**=varyant seç, **C**=kopyala, **P**=havuza at. `preventDefault` kullanılıyor.
- Başka yerde klavye kısayolu yok. Kısayol keşfedilebilirliği: X Studio içinde ipucu metni var; genel bir `?` yardım katmanı yok.

---

## 5. Performans Gözlemi + Lighthouse Baseline

### 5a. Lighthouse Denemesi — BAŞARISIZ

```
npx --yes lighthouse http://localhost:3000/tr --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo
```

**Sonuç:** Ortamda Chrome/Chromium yüklü olmadığından çalışmadı:
`Runtime error: The CHROME_PATH environment variable must be set to a Chrome/Chromium executable` (chrome-launcher Linux'ta yürütülebilir bulamadı; `google-chrome`/`chromium` PATH'te yok).
**Not:** Skor baseline'ı ilerleyen fazda Chrome kurulumuyla (ör. `apt install chromium` + `CHROME_PATH`) alınmalı; bu raporda yerine manuel ölçümler + kod tabanlı analiz var.

### 5b. Manuel Ölçümler (canlı, curl)

`curl -w` — http://localhost:3000/tr, 3 deneme:

| Deneme | TTFB | Toplam | HTTP |
|---|---|---|---|
| 1 | 1.58 s | 2.39 s | 200 |
| 2 | 1.07 s | 1.84 s | 200 |
| 3 | 2.54 s | 3.53 s | 200 |

- **TTFB ortalaması ~1.7 s** — LCP'yi doğrudan aşağı çeken, Lighthouse > 90 hedefi için en büyük engel (tamamı SSR, cache yok; ayrıntı 5c).
- **HTML boyutu:** ~102 KB (102.317–102.686 bytes). **`<script>` etiketi: 15** (9 harici `_next/static/chunks/*.js` + preload edilen 1 chunk + inline `self.__next_f` RSC verisi 1 blok). Canlı `title`: `example.com`, `<html lang="tr" class="dark">` ✅. Sayfada 3 `<img>` (haber görselleri, lazy).

### 5c. Kod Tabanlı Performans Bulguları

1. **`force-dynamic` her yerde (SSR-only; ISR/SSG yok):** Root layout dahil tüm 13 sayfa + sitemap + robots `export const dynamic = "force-dynamic"`. Her istek Prisma sorguları + `auth()` + sözlük import'u ile sunucuda render ediliyor; CDN/edge cache yok (admin için `no-store` mantıklı; feed ve haber detayı için gereksiz pahalı). **SEO için içerik indekslenebilir (SSR ✅) ama tarama bütçesi ve Core Web Vitals zarar görüyor.** Haber detay sayfaları (`/[lang]/news/[id]`) içerik imzalanabilir — ISR (`revalidate`) veya cache-headers adayı #1.
2. **`next/image` hiç kullanılmıyor** (0 başvuru; 6 yerde ham `<img>`, detayda biri eager). Kartlarda `loading="lazy"` ✅ var; ancak boyut optimizasyonu, `srcset`, modern format, `priority` (LCP görseli) yok. Harici görseller referrerPolicy ile çekiliyor.
3. **Font yükleme:** `next/font` yok, Google Fonts `<link>` yok (bkz. §3b). Sistem yığınına düşüş performansı yavaş yavaş bozmaz ama marka fontu garanti değil; `next/font/google` ile Inter self-host + `display: swap` önerisi (0 layout-shift ile).
4. **CLS riskleri:** Şu an reklam alanı yok → ana CLS kaynağı yok. Notlar: `Feed` iskeleti (`loading.tsx`) yüksekliği gerçek kartla uyumlu ✅; `CategoryTabs` sticky çubuğu sabit yükseklikli ✅. **Phase 8 (reklam) için:** `AdSlot` bileşeni mutlaka sabit `min-height` + `aria-hidden` iskelet rezervasyonu ile gelmeli; aksi halde feed'e late-inject edilen reklam CLS'i patlatır.
5. **İstemci bileşeni oranı:** 27/36 bileşen dosyası `"use client"` (~%74). Ancak ağır render sunucuda (feed ilk 10 kart, podcast listesi, tüm sayfa kabukları sunucu bileşeni); istemci kısmı interaktif sarmalayıcı. `AuthProvider` (SessionProvider) **root layout'ta tüm sayfaları istemci ağacına taşıyor** — `useSession` kullanan az sayıda bileşen için tüm uygulamayı client'a sarmak bundle'ı büyütür; sarmalayıcıyı `[lang]/layout`'a indirmek veya server-side `auth()` + prop geçişi değerlendirilebilir.
6. **Polling tuzakları:** Admin bileşenleri 4 sn, XStudio 1.5 sn polling — sekmeyi açık tutan owner için sunucu yükü; `document.visibilityState` kontrolü yok (NewsCard'ın view sayacı ise görünürlüğü doğru kontrol ediyor ✅).
7. **Güvenlik/istek başlıkları:** `next.config.ts`'te nosniff/DENY/Referrer-Policy/Permissions-Policy ✅; `poweredByHeader: false` ✅.

---

## 6. Eksik Analizi (10 Fazlı Yol Haritasına Göre)

Mevcut durum: **Faz 1 (keşif, bu belge)** tamamlanıyor. Aşağıda yol harikatasındaki frontend aksiyonları, mevcut kod tabanına bağlanmış iş kalemleri olarak.

| # | Faz / Alan | Mevcut Durum | Frontend İş Listesi |
|---|---|---|---|
| 1 | **PWA** | Hiçbir şey yok — `app/manifest.ts` yok, service worker yok, kurulum promptu yok | `app/manifest.ts` (ad, ikon `app/icon.svg`'den PNG setleri, `display: standalone`, tr/en `lang`); kurulum promptu bileşeni (`beforeinstallprompt` yakalayan, `localStorage` ile tek seferlik reddi anımsayan); `public/offline.html` veya `/[lang]/offline` sayfası + service worker (öncelik: kabuk + son haberlerin cache'i) |
| 2 | **Blog UI** | `/blog` boş `ComingSoon` stub'u, noindex | Liste sayfası (`NewsCard` deseni yeniden kullanılabilir: `blogCard`), detay sayfası (`MarkdownContent` + `TimeAgo` + paylaş), owner için editör (admin sekmesi veya ayrı rota; `field/btn-primary` formları). Metadata: noindex kaldırılıp canonical + OG eklenmeli |
| 3 | **Onboarding / Tema / Yazı Boyutu / Sessiz Saatler** | Hiçbiri yok; tema dark-only (`color-scheme: dark`), font ölçeği sabit, bildirim sistemi yok | İlk giriş turu (3–4 adımlık, `localStorage` bitiş işareti); tema anahtarı (dark-only'den light token setine — §3a'daki token yapısı buna hazır: `background/surface/accent` soyut); yazı boyutu ayarı (`text-[15px]` taban + `data-font-scale` html özniteliği + CSS değişkeni); sessiz saatler ayarı (profile/settings bölümü — bildirim altyapısı gelince bağlanacak, UI şimdi kurulabilir) |
| 4 | **AI Asistan 2.0 Sohbet UI** | `/assistant` boş stub, noindex | Sohbet arayüzü: mesaj listesi (`aria-live="polite"`), giriş satırı, streaming cevap (okunuyor göstergesi), öneri çipleri, sohbet geçmişi; mevcut `ComingSoon` kaldırılır |
| 5 | **Bülten Sayfası** | Yok (podcast "günlük bülten" fikri yalnızca backend tarafında) | `/[lang]/newsletter` tarzı liste + detay; e-posta abonelik formu (`.field` + `.btn-primary`, çerez/KVKK onay kutusu — `api/user/consent` altyapısı mevcut) |
| 6 | **Başarılar (Gamification UI)** | `/achievements` boş stub, noindex | Rozet/seri (streak) vitrini, ilerleme çubukları, kilitli/açık rozet durumları; veri API'si bekler (şimdilik statik tanımlar + `useSession`) |
| 7 | **AdSlot + Sponsorlu Şablon + Medya Kiti** | Reklam kodu hiç yok (CLS notu §5c-4) | `AdSlot` bileşeni: sabit `min-height` rezervasyon + `aria-hidden` + görünür olunca yükleme; sponsorlu haber kartı şablonu (`NewsCard`'a `sponsored` varyantı — açık renk rozeti + "Sponsorlu" etiketi, tarama motoruna `rel="sponsored"`); medya kiti sayfası (static, about deseni) |
| 8 | **Künye Sayfası** | Yok (about kısmen karşılıyor) | `/[lang]/kunye` — yayıncı, iletişim, teknik altyapı, AI kullanım şeffaflığı; `about` sayfa deseninin kopyası + sözlük anahtarları (tr/en 379→+N) |
| 9 | **SEO/Performans (Lighthouse > 90)** | Lighthouse ölçülemedi (Chrome yok); TTFB ~1.7 s | İş sırası: (a) Chrome kurulumu + CI'da lighthouse-ci ile baseline; (b) feed + `news/[id]` için cache/ISR (TTFB < 500 ms hedefi); (c) `next/image` geçişi + LCP görseline `priority`; (d) `next/font` ile Inter; (e) 26px ikon düğmelerini min 44px'e çıkarma; (f) `text-[10px]/[11px]/[15px]` gibi ara değerleri ölçeğe oturtma; (g) `AuthProvider`'ı root'tan [lang] layout'a indirme; (h) `aria-current` yerine sekme sistemlerinde `role="tab"` |
| 10 | **Genel tutarlılık** | — | `.card` yardımcı sınıfı oluşturup inline kart tekrarlarını toplama; `auth-error` metinlerini sözlüğe taşıma; `text-muted` token'ı ile `text-zinc-400/500` karışımını tekilleştirme; admin polling'lerine görünürlük kontrolü ekleme |

---

## Özet Metrikler

| Metrik | Değer |
|---|---|
| Sayfa rotası | 13 (+ error/loading/not-found) |
| Bileşen dosyası | 35 (+ `icons.tsx` modülü; 27 istemci) |
| i18n anahtarı | tr 379 = en 379 (simetrik ✅) |
| `force-dynamic` sayfası | 13/13 (ISR/SSG yok) |
| noindex sayfası | 8/13 (4'ü boş stub) |
| `next/image` kullanımı | 0 (6 ham `<img>`) |
| TTFB (canlı, ortalama) | ~1.7 s (1.07–2.54 s) |
| HTML boyutu / script | ~102 KB / 15 script etiketi |
| Lighthouse | Çalıştırılamadı — Chrome yok (CHROME_PATH hatası) |
