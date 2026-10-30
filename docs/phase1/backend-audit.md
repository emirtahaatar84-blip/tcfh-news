# Faz 1 — Backend Denetim Raporu (Keşif)

> Bu belge yalnızca mevcut kodun okunmasıyla üretilmiştir; hiçbir uygulama kodu değiştirilmemiş, build/typecheck çalıştırılmamıştır.
> Tarih: 2026-10-22 · Proje: `tcfh-news` (example.com)

---

## 1. Stack Tespiti

### 1.1 Bağımlılıklar (package.json)

| Paket | Sürüm | Rol |
|---|---|---|
| `next` | 16.4.2 | App Router framework (standalone output) |
| `react` / `react-dom` | 19.3.1 | UI |
| `next-auth` | ^5.0.0-beta.32 | Auth.js v5 (Google + Credentials) |
| `@auth/prisma-adapter` | ^2.11.3 | Auth.js ↔ Prisma adaptörü |
| `@prisma/client` / `prisma` | 5.22.0 | ORM (SQLite) |
| `bcryptjs` | ^3.0.3 (+ @types ^2.4.6) | E-posta/şifre kaydı için şifre hash'i |
| `rss-parser` | 3.13.0 | RSS/Atom tarama |
| `zod` | ^4.6.7 | İstek doğrulama (LLM çıktıları dahil) |
| `typescript` | 5.9.3 (dev) | Tür kontrolü |
| `tailwindcss` | 3.4.19 (dev) | Stil |
| `postcss` / `autoprefixer` | 8.5.31 / 10.4.21 (dev) | CSS pipeline |

- **Node:** `engines.node >= 20.9.0`; Docker imajı **node:22-alpine** kullanır.
- **NPM script'leri:** `dev`, `build` (= `prisma generate && next build`), `start`, `typecheck` (`next typegen && tsc --noEmit`), `db:generate`, `db:migrate` (dev), `db:deploy`, `db:studio`.
- **`output: "standalone"`** (`next.config.mjs`); `serverExternalPackages: ["rss-parser", "@prisma/client"]`; güvenlik başlıkları: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (kamera/mikrofon/lokasyon kapalı). `poweredByHeader: false`.

### 1.2 Docker kurulumu

- **Dockerfile** (multi-stage, `docker/dockerfile:1` sözdizimi):
  1. `base` — node:22-alpine + `libc6-compat openssl` (Prisma motorları için).
  2. `deps` — `npm ci`.
  3. `builder` — `npx prisma generate` + `npm run build`.
  4. `runner` — standalone `.next/standalone` + `.next/static` + `public` + `prisma/` klasörü; ayrıca migration çalıştırabilmek için `node_modules/prisma`, `node_modules/@prisma`, `node_modules/.prisma` kopyalanır. `nextjs` kullanıcısı (uid 1001), `EXPOSE 3000`.
- **docker-entrypoint.sh:**
  - `DATABASE_URL` boşsa `file:/app/prisma/data/news.db` olarak set eder.
  - Başlangıçta `prisma migrate deploy --schema=/app/prisma/schema.prisma` ile **migration otomatik uygulanır**.
  - Ardından `node server.js` (Next standalone sunucusu).
- **docker-compose.yml** (tek servis `news`, imaj `tcfh-news:latest`):
  - Port: `"${BIND_HOST:-0.0.0.0}:${APP_PORT:-3000}:3000"` (reverse proxy arkasındaysa `BIND_HOST=127.0.0.1` önerilir).
  - Kalıcı SQLite: `news_data` adlı named volume → `/app/prisma/data` (rsync/rebuild'den etkilenmez).
  - `healthcheck`: `wget -qO- http://127.0.0.1:3000/api/health` (30 sn aralık).
  - `security_opt: no-new-privileges:true`, `init: true`, log rotasyonu (10 MB × 3), `stop_grace_period: 20s`.
  - Tüm konfigürasyon `.env` üzerinden değişkenlerle aktarılır (ADMIN_PASSWORD zorunlu — `${ADMIN_PASSWORD:?...}`).

### 1.3 Dağıtım akışı (deploy.sh)

1. Ön kontroller: `.env` var mı, `ADMIN_PASSWORD` boş/`change-me-now` değil mi.
2. `rsync -az --delete` ile SSH üzerinden VPS'ye senkron (`.git`, `node_modules`, `.next`, `prisma/data`, `*.db*` hariç).
3. Uzakta `docker compose up -d --build --remove-orphans` → entrypoint migration'ları uygular.
4. `docker image prune -f` + durum raporu. Varsayılanlar: `VPS_HOST` (zorunlu), `VPS_USER=root`, `REMOTE_DIR=/opt/news`, SSH anahtarı `~/.ssh/id_ed25519`.

### 1.4 Cron / periodik işler

- **`instrumentation.ts`** (yalnızca `NEXT_RUNTIME === "nodejs"` ve üretim derleme fazı değilken):
  - **Haber sentez döngüsü:** ilk çalıştırma boot'tan ~60 sn sonra, sonra **her 10 dakika** → `lib/processor.ts` `startFetchJob()` (arka plan, aynı anda tek örnek — global kilit).
  - **Kalite denetimi:** ilk çalıştırma boot'tan ~5 dk sonra, sonra **her 60 dakika** → `lib/auditor.ts` `startAuditJob()`.
  - `ENABLE_INTERNAL_CRON=false` ile ikisi de kapatılabilir (harici crontab/aaPanel için `/api/cron/process?key=…` ve `/api/cron/audit` uçları var).
  - Tüm interval/timer'lar `unref()` — sürecin kapanmasını engellemez.
- **Döngü içi zamanlamalar (lib/processor.ts sabitleri):**
  - Kümeleme penceresi: son **60 dakika**; ham kayıt ömrü: **2 saat** (sonra purge).
  - Kaynak başına en fazla 15 item; prompt başına en fazla 6 makale; LLM eşzamanlılık 2; döngü başına en fazla 8 sentez.
  - Denetçi (qwen) yanıt veremezse taslak `pendingReview` olarak en fazla 3 döngü bekletilir (TTL 2 saat).

---

## 2. DB Şeması Özeti (prisma/schema.prisma)

SQLite (`env("DATABASE_URL")`), kalıcı volume `/app/prisma/data/news.db`. **15 model:**

### Auth (Auth.js v5)
| Model | Alanlar | İlişki / İndeks |
|---|---|---|
| `User` | id, name, email (unique), emailVerified, image, passwordHash, role (default "user": owner/admin/editor/moderator/user), newsletterConsent, selectedVoice (default "default"), createdAt, updatedAt | 1-N Account, Session |
| `Account` | id, userId, type, provider, providerAccountId, refresh/access token, expires_at, token_type, scope, id_token, session_state | N-1 User (Cascade); `@@unique([provider, providerAccountId])` |
| `Session` | id, sessionToken (unique), userId, expires | N-1 User (Cascade) |
| `VerificationToken` | identifier, token (unique), expires | `@@unique([identifier, token])` |

### Domain
| Model | Alanlar | Not / İndeks |
|---|---|---|
| `RawFeedItem` | id, hash (unique), title, content, sourceName, sourceUrl, imageUrl, fetchedAt, processedAt | Ham RSS tamponu, 2 saat sonra purge; `@@index([fetchedAt])`, `@@index([processedAt])` |
| `RSSSource` | id (autoincrement), name, url (unique), category (default "Gündem"), isActive, createdAt | Taranan kaynaklar (üretimde 29 adet — kodda seed yok, admin panelinden girilir); `@@index([isActive])` |
| `NewsItem` | id, title, summary, detailedContent, category (default "Diğer"), sourcesCount, sourcesList (JSON string[]), imageUrl, isVideo, youtubeId, viewCount, createdAt, removedAt, removalReason, removedBy ("gemma-audit"\|"owner"), qualityScore, auditedAt | Yayınlanan sentez haberi; **yumuşak moderasyon** (removedAt null = yayında); 1-N XDraft; indeksler: createdAt, [category, createdAt], removedAt, auditedAt |
| `XStyle` | id, name, slug (unique), systemPrompt, emojiLevel (2), maxEmoji (2), createdAt | X post stilleri; 1-N XDraft |
| `XDraft` | id, articleId, styleId, variants (JSON), hashtags (JSON), charCount, status (draft/copied/published/rejected), copiedAt, publishedAt, externalUrl, createdBy, createdAt, updatedAt | N-1 NewsItem (Cascade), N-1 XStyle; `@@index([articleId])`, `@@index([status, createdAt])` |
| `HashTagPool` | id, tag (unique), categoryId, weight, lastUsedAt | LLM'ın seçim yapabildiği kapalı hashtag havuzu; `@@index([categoryId, weight])` |
| `TtsCache` | id, cacheKey (unique, `news:{id}:{voice}` / `preview:{voice}`), mimeType (audio/mpeg), data (base64), createdAt | Sesli özet önbelleği (feed sorgularına taşınmaz) |
| `SystemSettings` | id (tek satır, id=1), siteName, providerUrl, apiKey, modelName, promptTemplate, updatedAt | LLM sağlayıcı + marka ayarları (DB'den yönetilir, .env'den değil) |
| `RemovedStory` | id, newsId, title, summary, reason, removedAt | Eski denetim kaydı (audit trail); moderasyon artık yumuşak kaldırmaya döndü |
| `PodcastEpisode` | id, title, mode (daily/weekly/custom), category, topic, newsIds (JSON), guests (JSON), script (JSON: speakers[]+turns[]), status (processing/draft/audio_processing/ready/failed/published), audio (Bytes), audioDurationSec, playedAt (yayınlama kilidi), publishedAt, error, createdAt, updatedAt | Tek konuşmacılı podcast ("Potkes"); ses script'e gömülü voiceKey ile sabitlenir |
| `VideoNews` | id, youtubeId (unique), url, videoTitle, channel, thumbnailUrl, transcript, title, summary, content, category, readTime, status (processing/ready/failed/published), playedAt (yayınlama kilidi), publishedAt, newsItemId, error, createdAt, updatedAt | YouTube → LLM haber üretimi; yayımlanınca NewsItem oluşur |

### Migration geçmişi (prisma/migrations/)

1. `20260101000000_init` — ilk şema
2. `20261019113029_kantan_views_images` — viewCount + imageUrl
3. `20261019150000_synthesis_auth` — sentez + auth (RSSSource kategori normalizasyonu, DeepSeek providerUrl)
4. `20261019160000_news_audio` — TtsCache (sesli özet)
5. `20261019170000_voice_personas` — selectedVoice
6. `20261020100000_moderation_credentials` — moderasyon + ADMIN_* kimlikleri
7. `20261020130000_x_studio` — XStyle/XDraft/HashTagPool (stiller ve hashtag havuzu seed'i migration içinde)
8. `20261020140000_user_roles` — User.role
9. `20261020150000_video_news` — VideoNews
10. `20261021103000_podcast_studio` — PodcastEpisode
11. `20261021130000_moderation_audit` — yumuşak kaldırma alanları (removedAt/reason/removedBy, qualityScore/auditedAt)

> Not: migration sayısı **11** (init dahil). `migration_lock.toml` → sqlite provider.

---

## 3. İş Mantığı Dökümü (lib/)

| Modül | Sorumluluk |
|---|---|
| `processor.ts` (967 satır) | Ana sentez motoru: RSS tarama → RawFeedItem'e stage (hash ile dedup) → son 60 dk başlık benzerliğiyle kümeleme (Türkçe fold, eşik 0.25) → LLM ile özgün Türkçe sentez → qwen3-vl-30b ön-yayın denetimi (`reviewStory`) → NewsItem yayını → 2 saatten eski ham kayıtları purge. Arka plan işi durumu globalThis'te tutulur (`getFetchJob`/`startFetchJob`). |
| `reviewer.ts` | Yayın öncesi kalite kapısı: LLM taslağını kaynak metinlerle karşılaştırır, `qwen3-vl-30b` (env `REVIEWER_MODEL`) ile onay/red verir. Ağ hatasında fırlatır → processor pendingReview olarak tekrar dener. `chat_template_kwargs: { enable_thinking: false }` zorunlu. |
| `auditor.ts` | Saatlik yayın denetimi: son 48 saatteki denetlenmemiş haberleri `gemma-4-31b` (env `AUDITOR_MODEL`) ile 1-10 puanlar; `keep=false` ise haberi **yumuşak kaldırır** (removedBy="gemma-audit"). `restoreNewsItem` ile geri getirme. |
| `x-studio.ts` | X/Twitter post atölyesi: post üretim iş kuyruğu (bellek içi job + polling), dakikada 10 üretim rate limit, katı AI kuralları (280 karakter, hashtag havuzu, emoji bütçesi, halüsinasyon yasağı), taslak CRUD, JSON audit log. |
| `video-news.ts` | YouTube linki → transkript fetch (watch/shorts/embed/live/v) → LLM ile özgün Türkçe haber → owner "oynatmadan yayımlayamaz" kilidi (playedAt) → NewsItem olarak yayım. Durum makinesi processing→ready/failed; retry ucu. |
| `podcast.ts` (1235 satır) | "Potkes" podcast stüdyosu: konu/mod seçimi → gerçek site haberlerinden konuşma senaryosu (LLM) → senaryo düzenleme + tek tur YZ yeniden yazımı → parçalı TTS (600 karakter) + birleştirme → owner dinleme kilidi → yayın. Zod şemaları ve PodcastError/PODCAST_ERROR_STATUS uçlarla paylaşılır. |
| `podcast-voices.ts` | Edge TTS sabit sinir ses kadrosu (Emel, Emma, William, Andrew, Brian); konuşmacı adından deterministik hash ile voiceKey ataması (ses tutarlılığı). |
| `tts.ts` | VoxCPM 2 sesli özet: OpenAI uyumlu `/audio/speech` ucu, Voice Design `instructions`, `news:{id}:{voice}` anahtarıyla TtsCache. `TTS_MODEL` (default voxcpm2). |
| `voices.ts` | Kullanıcı sesli-özet persona seti (default, male_1/2, female_1/2) — VoxCPM `instructions` metinleriyle. |
| `auth.ts` | `isAdminAuthorized(request)`: (1) owner rolüne sahip Auth.js oturumu → (2) HttpOnly admin oturum çerezi → (3) HTTP Basic Auth (ADMIN_USER/ADMIN_PASSWORD, timingSafeEqual). |
| `admin-session.ts` | Admin kimliklerinden (user:password) türetilen deterministik SHA-256 oturum token'ı + `news_admin_session` HttpOnly çerezi doğrulaması (8 saat, admin-constants). |
| `roles.ts` | Rol hiyerarşisi (owner > admin > editor > moderator > user); `isOwnerEmail` = sahip e-posta listesi **veya** DB rolü "owner". |
| `owner.ts` | `OWNER_EMAIL` env'inden (virgülle ayrılmış) sahip e-posta listesi; kodda iki Gmail adresi varsayılanı var. |
| `settings.ts` | Tek satırlık SystemSettings (LLM providerUrl/apiKey/modelName/promptTemplate, siteName); `toSafeSettings` API anahtarını istemciye taşımaz. |
| `trending.ts` | Son 150 başlıkta tekrarlayan anahtar kelimeleri (stopword filtreli) sayar → "İlginizi Çekebilir" etiketleri. |
| `categories.ts` | 10 sabit kategori + LLM'nin İngilizce üretebileceği eski değerlerin alias'ları, `normalizeCategory`. |
| `news-query.ts` | Public feed where-builder: daima `removedAt: null` + kategori + contains arama (title/summary/sourcesList). |
| `news-types.ts` / `rss-source.ts` | NewsItem/RSSSource → JSON DTO serileştirme (tarihler ISO string, sourcesList JSON parse). |
| `next-auth.ts` | Auth.js v5 yapılandırması: Google OAuth (yapılandırma yoksa düğme gizli), Credentials (bcrypt karşılaştırma), PrismaAdapter, JWT session, Türkçe `/auth-error` sayfası. |
| `prisma.ts` | Tekil PrismaClient (globalThis cache, prod'da). |
| `http.ts` | Paylaşılan JSON hata yardımcıları: `jsonError`, `unauthorized` (401 + `WWW-Authenticate: Basic`), `serverError`. |
| `admin-constants.ts` / `admin-types.ts` | Admin çerez adı/ömürleri, ayarlar DTO tipi. |
| `local-store.ts` | İstemci taraflı localStorage yardımcıları (yer imleri, oturumluk görüntüleme) — backend'siz anonim akış. |
| `i18n.ts` / `i18n-config.ts` / `format.ts` / `time.ts` | TR/EN sözlük yükleme, locale çözümleme, `{key}` placeholder, Intl.RelativeTimeFormat. |
| `utils.ts` | md5, stripHtml, truncate, hostnameFromUrl, extractJsonObject, parseJsonArray, foldTurkish, resolveChatCompletionsUrl, isValidHttpUrl vb. ortak yardımcılar. |
| `proxy.ts` (middleware) | Yerel yönlendirme (`/` → `/{locale}`), `x-locale`/`x-admin-page` başlıkları; admin sayfalarına `no-store, noindex`. `DEFAULT_LOCALE` (default tr). |

---

## 4. Güvenlik Notları

### Owner koruması deseni
- **`isAdminAuthorized(request)`** (lib/auth.ts) üç katmanlı: (1) Auth.js oturumu + `isOwnerEmail` (OWNER_EMAIL listesi veya DB role="owner"), (2) `news_admin_session` HttpOnly çerezi (SHA-256 token, timingSafeEqual), (3) HTTP Basic Auth (ADMIN_USER/ADMIN_PASSWORD, timingSafeEqual). Tüm admin/cron/moderasyon uçları ve X Stüdyo/video-news/podcast yetkisi bu fonksiyondan geçer.
- Cron uçlarında ek olarak `?key=CRON_SECRET_KEY` query parametresi de kabul edilir (timingSafeEqual).
- **"Oynatmadan/dinlemeden yayımlayamaz" kilitleri:** VideoNews ve PodcastEpisode'ta `playedAt` alanı publish uçlarında 403 ile zorunlu tutulur (AI içeriğinin insan onayı olmadan yayına girmesini engeller).
- Yayımlanmamış podcast sesi yetkisiz istemciye **404** döner (varlık sızdırılmaz); yayımlanmış ses public cache'lenir, owner önizlemesi asla.

### Riskler / zayıf noktalar
1. **Güvensiz dev secret fallback:** `lib/next-auth.ts` — `AUTH_SECRET` yoksa `"micro-news-insecure-dev-secret-change-me"` sabiti kullanılır. Üretimde `AUTH_SECRET` set edilmemişse JWT oturumları taklit edilebilir. (docker-compose'da default boş string geçer — yani fallback devreye girer.)
2. **Basic Auth yedeği:** ADMIN_PASSWORD ile tüm yönetim uçlarına tek faktörlü erişim mümkün; ADMIN_USER default "admin". `deploy.sh` zayıf parolayı engeller ama "change-me-now" dışındaki zayıf parolalar geçer.
3. **OWNER_EMAIL hardcode fallback:** env yoksa iki kişisel Gmail adresi koda gömülü — repo bilen biri, o adreslerle Google hesabı açarsa owner yetkisi kazanamaz (Google doğrulaması gerekir) ama attack surface olarak kalır; env ile yönetilmeli.
4. **CRON_SECRET_KEY query parametresi:** `?key=` URL'de görünür (proxy/access log'lara sızabilir). Authorization header tercih edilmeli.
5. **Admin session token deterministik:** çerez token'ı `sha256(user:password:sabit)` — parola değişmedikçe değişmez; çalınması halinde iptal yolu yalnızca parola değiştirmek.
6. **LLM API anahtarı DB'de düz metin** (`SystemSettings.apiKey`) — DB sızdırılırsa doğrudan kullanılabilir.
7. **Video transkript fetch'i** Masaüstü Chrome UA'sı ile YouTube'a doğrudan istek yapar (resmi olmayan yöntem; kırılgan, IP bazlı engel riski).
8. **Rate limit yalnızca X Stüdyo'da ve bellek içi** — yatay ölçeklemede veya restart'ta kaybolur; podcast/video üretiminde rate limit yok.
9. `news/view` sayacı best-effort ve kimliksiz (spoof edilebilir) — reklam/puan sistemi fazına kadar giderilmesi gerekir.

---

## 5. Env Değişkenleri Envanteri

Kodda `process.env` ile okunan + docker-compose/deploy'da kullanılan anahtarlar:

| Anahtar | Zorunluluk | Default | Kullanıldığı yer |
|---|---|---|---|
| `DATABASE_URL` | Zorunlu (giriş noktası default verir) | `file:/app/prisma/data/news.db` | prisma/schema.prisma, docker-entrypoint.sh, lib/prisma.ts |
| `ADMIN_USER` | Opsiyonel | `admin` | lib/admin-session.ts, lib/auth.ts, lib/x-studio.ts (actor) |
| `ADMIN_PASSWORD` | Yönetim/cron için zorunlu | — | lib/admin-session.ts, lib/auth.ts (docker-compose zorunlu kılar) |
| `AUTH_SECRET` | Prod'da zorunlu | güvensiz sabit | lib/next-auth.ts |
| `NEXTAUTH_SECRET` | Alternatif | (AUTH_SECRET yedeği) | lib/next-auth.ts |
| `AUTH_URL` | Önerilir | `https://example.com` | docker-compose → Auth.js |
| `GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_ID` | Opsiyonel (Google giriş) | boş → düğme gizli | lib/next-auth.ts |
| `GOOGLE_CLIENT_SECRET` / `AUTH_GOOGLE_SECRET` | Opsiyonel | boş | lib/next-auth.ts |
| `OWNER_EMAIL` | Opsiyonel | iki hardcoded Gmail | lib/owner.ts (virgülle ayrılmış liste) |
| `DEFAULT_LOCALE` | Opsiyonel | `tr` | proxy.ts |
| `SITE_URL` | Önerilir | `https://example.com` | app/[lang]/layout.tsx, robots.ts, sitemap.ts, lib/x-studio.ts |
| `ENABLE_INTERNAL_CRON` | Opsiyonel | etkin (`"false"` kapatır) | instrumentation.ts |
| `CRON_SECRET_KEY` | Opsiyonel | boş → Basic Auth fallback | app/api/cron/fetch, app/api/cron/process |
| `TTS_MODEL` | Opsiyonel | `voxcpm2` | lib/tts.ts, lib/podcast.ts (lib/speech.ts üzerinden) |
| `REVIEWER_MODEL` | Opsiyonel | `qwen3-vl-30b` | lib/reviewer.ts |
| `AUDITOR_MODEL` | Opsiyonel | `gemma-4-31b` | lib/auditor.ts |
| `BIND_HOST` / `APP_PORT` | Opsiyonel (dağıtım) | `0.0.0.0` / `3000` | docker-compose.yml, deploy.sh |
| `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_RUNTIME`, `NEXT_PHASE`, `NEXT_TELEMETRY_DISABLED`, `PRISMA_HIDE_UPDATE_MESSAGE` | Framework/altyapı | — | Dockerfile, instrumentation.ts, lib/prisma.ts |

Ayrıca deploy.sh override'ları: `SSH_KEY`, `VPS_HOST`, `VPS_USER`, `SSH_PORT`, `REMOTE_DIR` (uygulama çalışma zamanı değil).

---

## 6. Eksik Analizi (10 fazlı yol haritasına göre)

| # | Yol haritası fazı | Mevcut durum / Backend eksiği |
|---|---|---|
| 1 | **PWA service worker + Web Push (VAPID)** | Hiçbiri yok: `public/` içinde SW yok, `web-push` bağımlılığı yok, VAPID anahtar env'leri yok, `PushSubscription` modeli yok. Bildirim izin uçları (`/api/push/subscribe`) tasarlanmalı. |
| 2 | **Blog Post modeli + RSS feed + görüntülenme sayacı** | `app/[lang]/blog` klasörü var ama `Post` modeli/DB tablosu **yok**; dışa RSS feed ucu (`/feed.xml` veya `/api/feed`) yok (yalnızca `sitemap.ts`/`robots.ts` var). `viewCount` NewsItem'ta var ama blog için ayrı sayaç/persist yok. |
| 3 | **Kullanıcı tercihleri API + okuma geçmişi** | Kısmen: `selectedVoice` + `newsletterConsent` uçları var. Eksik: kategori tercihleri, okuma geçmişi (History modeli / `ReadingEvent`), "diğerlerini gizle" vb. tam bir preferences DTO'su. `local-store.ts` tamamen istemci taraflı. |
| 4 | **RAG (embedding + vektör arama) + AI kotası** | Hiç yok: embedding API çağrısı, vektör saklama (SQLite'ta blob veya harici vektör DB), anlamsal arama ve kullanıcı başına AI kota/kullanım takibi (`AiUsage` modeli) yok. `TtsCache` benzeri bir kota/önbellek tablosu gerekli. |
| 5 | **Sabah bülteni cron + e-posta** | `newsletterConsent` bayrağı var ama e-posta gönderimi, bülten şablonu, `Newsletter`/`EmailLog` modeli, sabah cron'u (instrumentation'a üçüncü job) ve sağlayıcı (SMTP/Resend) yok. |
| 6 | **Puan/rozet modeli** | Hiç yok: `Point`, `Badge`, `UserBadge` modelleri; puan kazanma olayları ve `/api/user/points` uçları tasarlanmalı. |
| 7 | **Reklam/sponsor/premium + ödeme webhook** | `public/ads.txt` var (içeriği boş/sembolik); `AdSlot`, `Sponsor`, `PremiumPlan`, `Subscription`, `PaymentEvent` modelleri ve webhook ucu (`/api/webhooks/payment`) yok. |
| 8 | **Künye/UETS sayfaları** | `app/[lang]/legal` + `about` klasörleri var (statik sayfa); UETS numarası/yapılandırma env veya settings'te değil — içerik eksiği, backend değişikliği minimal. |
| 9 | **SSR/SEO + analytics + schema.org** | `sitemap.ts`/`robots.ts` var; JSON-LD (NewsArticle schema.org) işaretlemesi, OG/Twitter meta etiketleri tutarlı değil, sayfa görüntüleme analitiği (privacy-friendly, öz-hosted) ve `/api/analytics` toplayıcısı yok. |
| 10 | (genel) | Test altyapısı sıfır (hiç test dosyası yok); `typecheck` script'i var ama CI yok. Rate limit bellek içi; loglar yalnızca stdout/audit JSON. |

---

## 7. Notlar / Kritik Bulgular (özet)

1. **AUTH_SECRET üretim fallback'i güvensiz sabit** — compose'da boş geçilebiliyor; zorunlu hale getirilmeli.
2. **RSS kaynakları koda gömülü değil** (29 kaynak üretim DB'sinde, admin panelinden yönetiliyor) — yeni ortam kurulumunda elle girilmeli; seed betiği önerilir.
3. **TTS_VOICE env'i kodda okunmuyor** (lib/tts.ts voice'u `"default"` hardcoded) — .env.example'de not düşüldü.
4. **Vektör/arama altyapısı, blog modeli, push, ödeme — hepsi Faz 2+ işi**; mevcut şema bunlara hazır değil ama modüler migration geçmişi düzgün.
5. **X Stüdyo / video-news / podcast job'ları bellek içi** (globalThis) — standalone tek konteynerde güvenli, çoklu örnek/rolling deploy'da iş kaybı riski var.
