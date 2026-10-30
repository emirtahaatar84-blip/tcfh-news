# API Sözleşmesi — news.example.com

> Faz 1 keşif çıktısıdır; tüm bilgiler `app/api/**/route.ts` dosyalarından okunarak derlenmiştir.
> Genel kurallar: tüm yanıtlar JSON (ses uçları hariç), hata gövdesi `{ "error": "<KOD>", "message": "<açıklama>" }`.
> Yetkilendirme katmanları: **public** (giriş gerekmez), **user** (Auth.js oturumu), **owner** (`isAdminAuthorized`: owner oturumu / admin çerezi / Basic Auth), **cron** (owner **veya** `?key=CRON_SECRET_KEY`).

## İçindekiler

1. [Auth](#1-auth)
2. [News (public akış)](#2-news-public-akış)
3. [Cron](#3-cron)
4. [Admin / Moderasyon](#4-admin--moderasyon)
5. [X Stüdyo](#5-x-stüdyo)
6. [Video Haberler](#6-video-haberler)
7. [Podcast](#7-podcast)
8. [Kullanıcı](#8-kullanıcı)
9. [Diğer](#9-diğer)
10. [Faz 2+ için planlanan uçlar (KESTİRİM)](#10-faz-2-için-planlanan-uçlar-kestirim)

---

## 1. Auth

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]/*` | public | Auth.js v5 handler'ları (`signin`, `callback`, `signout`, `session`, `error`, …) |
| POST | `/api/auth/register` | public | E-posta + şifre kaydı |

### POST `/api/auth/register`
İstek: `{ "name": "Ad (opsiyonel, ≤100)", "email": "a@b.com", "password": "min 8 karakter" }`
Yanıt 201:
```json
{ "user": { "id": "clx…", "email": "a@b.com", "name": "Ad", "role": "user" } }
```
Hatalar: `400 INVALID_JSON` · `400 INVALID_EMAIL` · `400 WEAK_PASSWORD` · `409 EMAIL_TAKEN` (Google'lı hesap da bu şekilde kilitlenir).

---

## 2. News (public akış)

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/news` | public | Sayfalı akış (kaldırılmışlar gizli) |
| POST | `/api/news/view` | public | Görüntüleme sayacı (best-effort) |
| GET | `/api/news/[id]/audio` | public* | Sesli özet mp3 (*oturumluyse tercih edilen ses) |
| POST | `/api/news/[id]/remove` | owner | Yumuşak kaldırma |

### GET `/api/news?page=&limit=&category=&q=`
Sorgu: `page` (≥1, default 1), `limit` (1–30, default 10), `category` (10 sabit kategoriden biri), `q` (≤100 karakter).
Yanıt 200:
```json
{
  "items": [{
    "id": "clx…", "title": "…", "summary": "…",
    "detailedContent": "## …\n…", "category": "Teknoloji",
    "sourcesCount": 3, "sources": ["ntv.com.tr", "trthaber.com", "bbc.com"],
    "imageUrl": "https://…", "isVideo": false, "youtubeId": null,
    "viewCount": 42, "createdAt": "2026-10-22T08:00:00.000Z"
  }],
  "nextPage": 2, "hasMore": true
}
```
Hata: `400 INVALID_CATEGORY`. Kaldırılmış (`removedAt != null`) haberler hiç döner.

### POST `/api/news/view`
İstek: `{ "id": "clx…" }` (regex `^[a-zA-Z0-9_-]{8,64}$`).
Yanıt 200: `{ "viewCount": 43 }` · Hata: `400 INVALID_JSON|INVALID_ID` · `404 NOT_FOUND` · `500 INTERNAL_ERROR`.

### GET `/api/news/[id]/audio`
Oturumdaki kullanıcının `selectedVoice` personasıyla (anonim = `default`) sentezlenmiş mp3; `TtsCache`'te `news:{id}:{voice}` anahtarıyla önbelleklenir. Yanıt 200: `audio/mpeg` binary. Hatalar: `400|404|502|500 AUDIO_FAILED` (kaldırılmış haber → 404).

### POST `/api/news/[id]/remove`
İstek: `{ "reason": "copyright" | "hallucination" }`.
Davranış: `RemovedStory` audit kaydı yazılır, `TtsCache`(`news:{id}:*`) temizlenir, NewsItem yumuşak kaldırılır (`removedBy: "owner"`). İdempotent.
Yanıt 200: `{ "success": true }` · Hata: `400 INVALID_ID|INVALID_REASON` · `401 UNAUTHORIZED` · `404 NOT_FOUND`.

---

## 3. Cron

Tüm cron uçları **arka planda** iş başlatır ve **202** döner (gateway timeout önlenir). `?key=CRON_SECRET_KEY` (varsa) **veya** owner yetkisi gerekir.

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET/POST | `/api/cron/process` | cron/owner | Tam sentez döngüsü (fetch + process aynı job) |
| GET/POST | `/api/cron/fetch` | cron/owner | Sentez döngüsünün kısa yolu (process ile aynı `startFetchJob`) |
| GET/POST | `/api/cron/audit` | owner | Saatlik gemma kalite denetimini tetikler |

Yanıt 202 (process/fetch):
```json
{
  "running": true, "started": true,
  "startedAt": "2026-10-22T08:00:00.000Z", "finishedAt": null,
  "lastResult": null, "error": null
}
```
`lastResult` (bittiğinde): `{ "staged": n, "clusters": n, "verified": n, "published": n, "rejected": n, "purged": n, "failed": n, "errors": [] }`.
Audit yanıtı 202: `{ "running": bool, "started": bool, "startedAt": …, "finishedAt": …, "lastResult": { "audited": n, "kept": n, "removed": n, "failed": n, "errors": [] }, "error": null }`.
Hata: `401 UNAUTHORIZED` (+`WWW-Authenticate: Basic`).

---

## 4. Admin / Moderasyon

Tümü **owner** yetkisi ister. Zod kullanılmayan uçlarda manuel doğrulama vardır.

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET/POST | `/api/admin/fetch` | Tarama işini başlat / durumunu getir |
| PUT | `/api/admin/llm` | LLM sağlayıcı ayarları |
| PUT | `/api/admin/settings` | Site adı |
| GET/POST | `/api/admin/rss` | RSS kaynak listesi / ekleme |
| PATCH/DELETE | `/api/admin/rss/[id]` | Kaynak aç-kapa / sil |
| GET | `/api/admin/moderation/removed` | Yumuşak kaldırılmış haberler |
| POST | `/api/admin/moderation/restore` | Kaldırılmış haberi geri getir |
| GET | `/api/admin/moderation/suggestions` | "En iyi haberler" (qualityScore'a göre ilk 8) |

### GET `/api/admin/fetch` → 200 `{ running, startedAt, finishedAt, lastResult, error }`
### POST `/api/admin/fetch` → 202 (cron yanıtıyla aynı şekil)

### PUT `/api/admin/llm`
İstek: `{ "providerUrl": "https://api.deepseek.com/v1", "modelName": "deepseek-v4-flash", "promptTemplate": "…(boşsa default)", "apiKey": "sk-…(opsiyonel)", "clearApiKey": false }`
Yanıt 200: `{ "settings": { "id": 1, "siteName": "…", "providerUrl": "…", "modelName": "…", "promptTemplate": "…", "hasApiKey": true, "updatedAt": "ISO" } }`
Hata: `400 INVALID_PROVIDER_URL|INVALID_MODEL_NAME`. **apiKey asla yanıta dönmez** (yalnız `hasApiKey`).

### PUT `/api/admin/settings`
İstek: `{ "siteName": "1–80 karakter" }` → Yanıt 200: `{ "settings": {…SafeSettings}, "defaults": { "siteName": "example.com" } }` · Hata: `400 INVALID_SITE_NAME`.

### GET `/api/admin/rss` → 200
```json
{ "sources": [{ "id": 1, "name": "NTV", "url": "https://www.ntv.com.tr/gundem.rss", "category": "Gündem", "isActive": true, "createdAt": "ISO" }] }
```

### POST `/api/admin/rss`
İstek: `{ "name": "NTV (opsiyonel, ≤100)", "url": "https://…", "category": "Gündem (geçersizse 'Diğer')" }`
Yanıt 201: `{ "source": {…} }` · Hata: `400 INVALID_URL` · `409 DUPLICATE_SOURCE`.

### PATCH `/api/admin/rss/[id]`
İstek: `{ "isActive": true }` → 200 `{ "source": {…} }` · Hata: `400 INVALID_ID|INVALID_PAYLOAD` · `404 NOT_FOUND`.

### DELETE `/api/admin/rss/[id]` → 200 `{ "success": true }` · Hata: `400 INVALID_ID` · `404 NOT_FOUND`.

### GET `/api/admin/moderation/removed` → 200
```json
{ "items": [{ "id": "clx…", "title": "…", "removedAt": "ISO", "removalReason": "copyright", "removedBy": "owner" }] }
```
(en fazla 50, `removedAt` sıralı; `removedBy`: `"owner" | "gemma-audit"`)

### POST `/api/admin/moderation/restore`
Zod: `{ "newsItemId": "5–40 [a-zA-Z0-9]" }` → 200 `{ "success": true }` · Hata: `400 INVALID_JSON|INVALID_PAYLOAD` · `404 NOT_FOUND`.

### GET `/api/admin/moderation/suggestions` → 200
```json
{ "items": [{ "id": "…", "title": "…", "summary": "…", "category": "…", "qualityScore": 9, "createdAt": "ISO" }] }
```
(yayında + denetlenmiş + son 36 saat, `qualityScore` desc, ilk 8)

---

## 5. X Stüdyo

Tümü **owner** (`isStudioAuthorized` = `isAdminAuthorized`). Üretim asenkron: POST job açar → GET poll.

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/x-studio/articles?date=&category=&q=` | Post üretilebilir yayınlanmış haberler (60 adet, `hasDraft` mükerrer bayrağı) |
| GET | `/api/x-studio/hashtags?categoryId=` | Kapalı hashtag havuzu (weight desc, 50) |
| POST | `/api/x-studio/generate` | Post varyantı üretimi (kuyruğa atar) |
| GET | `/api/x-studio/generate/[jobId]` | İş durumu / sonuç poll |
| GET | `/api/x-studio/drafts?status=` | Taslak havuzu (100) |
| POST | `/api/x-studio/drafts` | Varyantı havuza kaydet |
| PATCH | `/api/x-studio/drafts/[id]` | Durum güncelle |

### POST `/api/x-studio/generate`
Zod (`generateRequestSchema`):
```json
{
  "articleIds": ["clx…"],           // 1–5 adet, ^[a-zA-Z0-9]{5,40}$
  "styleSlug": "analiz",            // ^[a-z0-9-]{2,30}$
  "tone": "tarafsiz",               // tarafsiz | sicak | ciddi (default tarafsiz)
  "length": "orta",                 // kisa | orta | uzun (default orta)
  "emojiLevel": 2,                  // 0–5 (default 2)
  "withSource": true,               // default true
  "withBadge": true                 // default true
}
```
Yanıt 202: `{ "jobId": "xjob_…" }` · Hatalar: `400 INVALID_JSON|INVALID_PAYLOAD` (issues dizisiyle) · `429 RATE_LIMITED` (kullanıcı başına dakikada 10).

### GET `/api/x-studio/generate/[jobId]` → 200
```json
{
  "id": "xjob_…", "status": "done",  // queued | running | done | failed
  "results": [{ "articleId": "clx…", "title": "…",
    "variants": [{ "text": "…", "hashtags": ["#teknoloji"], "charCount": 214 }] }],
  "error": null, "createdAt": "ISO", "finishedAt": "ISO"
}
```
Hata: `404 NOT_FOUND` (iş 10 dk sonra bellekten silinir).

### GET `/api/x-studio/drafts?status=draft|copied|published|rejected` → 200
```json
{ "drafts": [{ "id": "…", "articleId": "…", "articleTitle": "…", "styleName": "Analiz",
  "text": "…", "hashtags": ["#teknoloji"], "charCount": 214, "status": "draft",
  "copiedAt": null, "publishedAt": null, "externalUrl": null, "createdAt": "ISO" }] }
```

### POST `/api/x-studio/drafts`
Zod (`draftCreateSchema`): `{ "articleId": "…", "styleId": "…", "text": "1–1000 karakter", "hashtags": ["#…"] (≤3) }`
Yanıt 201: `{ "draft": {…}, "duplicateWarning": false }` · Hata: `404 NOT_FOUND`.

### PATCH `/api/x-studio/drafts/[id]`
Zod (`draftPatchSchema`): `{ "status": "draft|copied|published|rejected", "externalUrl": "https://… (opsiyonel)" }`
Yanıt 200: `{ "draft": {…} }` (copied→`copiedAt`, published→`publishedAt` otomatik) · Hata: `400|404`.

---

## 6. Video Haberler

Tümü **owner** (`isVideoNewsAuthorized`). Durum makinesi: `processing → ready | failed`; `failed → processing` (retry); `ready → published` (publish, `playedAt` kilidi).

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/video-news` | Tüm kayıtlar (100, transkript hariç) |
| POST | `/api/video-news` | YouTube linki gönder (processing başlar) |
| DELETE | `/api/video-news/[id]` | Kaydı sil (yayımlanmışsa NewsItem akışta kalır) |
| POST | `/api/video-news/[id]/play` | playedAt işaretle (yayınlama kilidi) |
| POST | `/api/video-news/[id]/retry` | failed → processing |
| POST | `/api/video-news/[id]/publish` | ready → published (NewsItem oluştur) |

### POST `/api/video-news`
Zod (`videoNewsSubmitSchema`): `{ "url": "https://www.youtube.com/watch?v=…" }` (watch / youtu.be / shorts / embed / live / v).
Yanıt 201: `{ "item": { "id": "…", "youtubeId": "abcdefghijk", "url": "…", "videoTitle": "…", "channel": "…", "thumbnailUrl": "…", "title": null, "summary": null, "content": null, "category": null, "readTime": null, "status": "processing", "playedAt": null, "publishedAt": null, "newsItemId": null, "error": null, "createdAt": "ISO", "updatedAt": "ISO" } }`
Hata: `400 INVALID_JSON|INVALID_PAYLOAD|SUBMIT_FAILED` (aynı video → mevcut kayıt döner, mükerrer engeli).

### POST `/api/video-news/[id]/publish` → 200
`{ "newsItemId": "clx…", "item": {…} }`
Hatalar (`VideoNewsError.code`): `404 NOT_FOUND` · `403 NOT_PLAYED` (owner oynatmadan) · `409 NOT_READY|ALREADY_PUBLISHED` · `500 PUBLISH_FAILED`.

### DELETE `/api/video-news/[id]` → 200 `{ "deleted": true, "newsItemId": "…|null", "newsItemKept": true }`
### POST `…/play` → 200 `{ "item": {…} }` (idempotent — playedAt yalnızca null'ken set edilir)
### POST `…/retry` → 200 `{ "item": {…} }` · Hata: `409 NOT_FAILED`.

---

## 7. Podcast

Admin uçları **owner**; `GET /api/podcast/public` ve yayımlanmış `…/audio` **public**.
Durum makinesi: `processing → draft | failed`; `draft → audio_processing → ready | failed`; `ready → published` (playedAt kilidi).

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/podcast` | owner | Tüm bölümler (100, script dahil, ses hariç) |
| POST | `/api/podcast` | owner | Yeni bölüm (senaryo üretimi arka planda) |
| DELETE | `/api/podcast/[id]` | owner | Bölümü sil (ses dahil) |
| PUT | `/api/podcast/[id]/script` | owner | Senaryo metnini değiştir (sesi geçersiz kılar) |
| POST | `/api/podcast/[id]/audio` | owner | Ses üretimini başlat (202) |
| GET | `/api/podcast/[id]/audio` | public/owner | mp3 (owner her statüde; public yalnız published) |
| POST | `/api/podcast/[id]/play` | owner | playedAt işaretle (yayınlama kilidi) |
| POST | `/api/podcast/[id]/publish` | owner | ready → published |
| GET | `/api/podcast/public` | public | Yayımlanmış bölümler (senaryo metni YOK) |

### POST `/api/podcast`
Zod (`podcastSubmitSchema`):
```json
{
  "mode": "daily",                   // daily | weekly | custom
  "category": "Teknoloji",           // opsiyonel, null = tüm kategoriler
  "topic": "…(≤500, custom modda zorunlu veya newsIds)",
  "newsIds": ["clx…"]                // opsiyonel, ≤8 — "tek tık" modu
}
```
Yanıt 201: `{ "item": { "id", "title", "mode", "category", "topic", "newsIds", "script": { "speakers": [{ "name", "role", "voiceKey" }], "turns": [{ "speaker", "text" }] }, "status", "hasAudio", "audioDurationSec", "playedAt", "publishedAt", "error", "createdAt", "updatedAt" } }`

### PUT `/api/podcast/[id]/script`
Zod (`podcastScriptUpdateSchema`): `{ "turns": [{ "speaker": "…", "text": "≤6000" }] (1–40; UI tek yazma alanını tek tur olarak gönderir), "speakerVoices": { "Sunucu": "emel" } (opsiyonel, voiceKey) }` → 200 `{ "item": {…} }`

### POST `/api/podcast/[id]/audio` → 202 `{ "item": {…} }`
### GET `/api/podcast/[id]/audio` → 200 `audio/mpeg` (Content-Length, Accept-Ranges; published → `public, max-age=3600`, owner → `private, no-store`) · Hata: `404 NOT_FOUND` (yetkisiz + yayınlanmamış da 404).
### POST `/api/podcast/[id]/play` → 200 `{ "item": {…} }` (idempotent)
### POST `/api/podcast/[id]/publish` → 200 `{ "item": {…} }`
PodcastError kodları: `404 NOT_FOUND` · `403 NOT_PLAYED` · `409 NOT_READY|NOT_DRAFT|INVALID_STATE|ALREADY_PUBLISHED` · `400 INVALID_SCRIPT|INVALID_ARGUMENT` · `500 …_FAILED`.

### GET `/api/podcast/public` → 200
```json
{ "items": [{ "id": "…", "title": "…", "mode": "daily", "category": "Teknoloji",
  "publishedAt": "ISO", "audioDurationSec": 612, "hasAudio": true,
  "speakers": [{ "name": "Sunucu", "role": "Moderatör" }] }] }
```
(yayımlanmış, en yeni 50)

---

## 8. Kullanıcı

Tümü **user** (Auth.js oturumu; Basic Auth ile ÇALIŞMAZ).

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/user/consent` | Bülten onayı oku |
| POST | `/api/user/consent` | `{ "newsletterConsent": true }` |
| GET | `/api/user/voice` | Tercih edilen ses personası |
| PUT | `/api/user/voice` | `{ "voice": "default|male_1|male_2|female_1|female_2" }` |
| GET | `/api/user/voice/preview?voice=` | Persona örnek mp3 (`preview:{voice}` cache, private 24h) |

Yanıtlar: `{ "newsletterConsent": true }` · `{ "voice": "female_1" }` · binary mp3.
Hatalar: `401 UNAUTHORIZED` · `400 INVALID_JSON|INVALID_PAYLOAD|INVALID_VOICE` · `502|500 AUDIO_FAILED`.

---

## 9. Diğer

### GET `/api/health` (public)
`200 { "status": "ok" }` (DB `SELECT 1` atılır) · `503 { "status": "error", "message": "Database is not reachable." }` — docker healthcheck tarafından kullanılır.

---

## 10. Faz 2+ için planlanan uçlar (KESTİRİM)

> Aşağıdaki uçlar henüz UYGULANMAMIŞTIR; 10 fazlı yol haritasından türetilmiş önerilerdir. Şekil/yol değişebilir.

| Faz | Olası uç | Yöntem | Notlar |
|---|---|---|---|
| PWA/Push | `/api/push/subscribe` | POST | VAPID public key `GET /api/push/key`; abonelik `PushSubscription` modeline |
| PWA/Push | `/api/push/unsubscribe` | POST | — |
| Blog | `/api/blog/posts` | GET/POST | `Post` modeli + slug; RSS feed için `GET /feed.xml` |
| Blog | `/api/blog/posts/[slug]/view` | POST | Blog görüntüleme sayacı |
| Tercihler | `/api/user/preferences` | GET/PUT | Kategori tercihleri, tema, bildirim ayarları |
| Okuma geçmişi | `/api/user/history` | GET/POST/DELETE | `ReadingEvent` modeli; "okundu" işaretleme |
| RAG | `/api/search/semantic?q=` | GET | Embedding + vektör arama; AI kotası uygulanır |
| RAG | `/api/user/ai-usage` | GET | Kalan kota; `AiUsage` modeli |
| Bülten | `/api/newsletter/unsubscribe?token=` | GET | Token'lı güvenli çıkış |
| Bülten | `/api/cron/morning-brief` (cron) | GET/POST | Sabah bülteni derleme + gönderim job'u |
| Puan/rozet | `/api/user/points` · `/api/leaderboard` | GET | `Point`/`Badge`/`UserBadge` modelleri |
| Premium | `/api/billing/checkout` · `/api/billing/portal` | POST | Sponsor/premium modelleri |
| Premium | `/api/webhooks/payment` | POST | Sağlayıcı imza doğrulaması (public ama imzalı) |
| SEO | `/api/analytics/collect` | POST | Privacy-friendly sayfa olayları |
| Künye | — (statik sayfa) | — | `/tr/about` içeriği; env gerekirse `SITE_UETS_ID` |

Mevcut uçlarla uyum notları: cron uçları `?key=` deseniyle genişletilebilir; owner uçları `isAdminAuthorized` üzerinden geçmeye devam etmeli; user uçları Auth.js oturumu (Basic Auth değil) kullanır.
