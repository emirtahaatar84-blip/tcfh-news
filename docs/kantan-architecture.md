# Kantan — AI Destekli Çok Dilli Haber Platformu
## Mimari Tasarım ve Yönetim Paneli Spesifikasyonu

> **Sürüm:** 1.0 · **Tarih:** 20 Ekim 2026
> **Kapsam:** Arka uç mimarisi, veritabanı şeması, yönetim paneli (13 modül), teknik kurallar, yol haritası

---

## 0. Mevcut Durum Düzeltmeleri (Önemli)

Tasarım öncesi kod tabanının gerçeği ile brief'teki "bildiklerim" arasında farklar var —
hedef mimari bunlara göre konumlandırıldı:

| Brief'te yazılan | Kod tabanındaki gerçek | Etki |
|---|---|---|
| Vite + React SPA | **Next.js 16 App Router (SSR)** | İyi haber: SPA'dan SSR'e geçiş derdi yok; admin paneli aynı repo içinde route bazlı büyütülür |
| i18n tr/en/es | tr/en (es eklenmeli) | `ArticleTranslation` şeması locale-bağımsız; es eklemek veri + sözlük işi |
| Postgres varsayımı | **SQLite + Prisma** (Docker volume) | Şema Postgres için yazıldı; geçiş planı §1f'de |
| PWA, font_scale, dark/light | Dark-only, PWA yok | v1 backlog'a alındı |
| "X kaynak doğrulandı = duplicate-detection" | 3+ kaynaklı olay kümeleme (LLM isValidStory) | Doğru yol; şemada `Story.similarityScore` ile güçlendiriliyor |
| — | E-posta/şifre + Google girişi, sessiz kaldırma API'si, TTS önbelleği **yarı yapılmış durumda** | MVP fazının ilk maddeleri (bkz. §5) |

---

## 1. GÖREV 1 — MİMARİ

### 1a. Mimari Özet (1 sayfa)

**Temel karar: Modüler monolit.** Düşük RAM'li tek VPS'te süreç sayısını artırmak
en pahalı hatadır (her Node süreci ~80-150 MB). Tüm iş mantığı tek Next.js
sürecinde **modül** olarak yaşar; yalnızca **worker** (kuyruk tüketicisi) ayrı
süreç olabilir. Modüller arası iletişim doğrudan fonksiyon çağrısı + kuyruk
tablosu üzerinden; HTTP/IPC yok. Bu, yarın 3 node'a geçişi engellemez: kuyruk
arayüzü soyutlandı (§1b), medya ve arama da interface arkasında.

```
                        ┌──────────────────────────────────────────────────┐
                        │                VPS (düşük RAM)                   │
                        │                                                  │
  RSS/Atom/İHA/AA ──────►  ┌────────────────────────────────────────────┐  │
  (İleride abonelik)      │        Next.js Süreci (web + API)           │  │
                          │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │  │
                          │  │ ingestion│  │publish   │  │ search    │  │  │
                          │  │ (poller) │  │(sitemap, │  │(FTS5 →tsv)│  │  │
                          │  └────┬─────┘  │ RSS, og) │  └───────────┘  │  │
                          │       │        └──────────┘                  │  │
                          │  ┌────▼──────────────────────────────────┐   │  │
                          │  │   CORE: DB kuyruğu (QueueJob tablosu) │   │  │
                          │  └────┬──────────────────────────────────┘   │  │
                          │  ┌────▼──────────┐  ┌────────────────────┐   │  │
                          │  │ dedupe&cluster│  │ AI işleme (LLM/    │   │  │
                          │  │ (embedding    │  │ TTS/özet/çeviri)   │   │  │
                          │  │  + kural)     │  │ AiJob + retry+DLQ  │   │  │
                          │  └────┬──────────┘  └─────────┬──────────┘   │  │
                          │       │  ┌────────────────┐  │              │  │
                          │       └─►│ medya/görsel   │◄─┘              │  │
                          │          │ (lisans+önbek) │                 │  │
                          │          └────────────────┘                 │  │
                          │  ┌───────────────┐  ┌────────────────────┐   │  │
                          │  │ bildirim      │  │ podcast (TTS+RSS)  │   │  │
                          │  │ (mail, webpush│  │ günlük bülten      │   │  │
                          │  │  — v2)        │  └────────────────────┘   │  │
                          │  └───────────────┘                           │  │
                          └───────────────────────┬──────────────────────┘  │
                                                  │                         |
                          ┌───────────────────────▼──────────────────────┐  │
                          │  SQLite (bugün) → PostgreSQL (v1)             │  │
                          │  Prisma ORM · FTS5/tsvector · TTS önbelleği   │  │
                          └──────────────────────────────────────────────┘  │
                                                                        │
  Cloudflare (CDN/WAF) ──────► 443 ──► Next.js                          │
  Kendi mail sunucusu (düşük kota) ◄── yalnız kritik uyarılar (v2'ye dek ertelendi)
```

**Süreç ayrımı kararları:**

| Modül | Bugün | Gerekçe |
|---|---|---|
| ingestion (poller) | aynı süreç (cron tick, 10 dk) | 16 kaynak × HTTP fetch, bellek ihmal edilebilir |
| dedupe & clustering | aynı süreç | CPU: token/DF hesabı ~ms seviyesi |
| AI işleme (LLM/TTS) | aynı süreç, **kuyruk arkasında** | Ağ-bağımlı, CPU değil; senkron asla (Cloudflare 524) |
| publish | aynı süreç | Ucuz DB yazımları |
| medya/görsel | aynı süreç + disk önbellek |sharp/resize işleri kuyruğa atılır |
| bildirim | **v2** — bugün yok | Mail kotası düşük; RSS + web push yeterli |
| arama | aynı süreç (FTS5) | Veri hacmi küçük; Meilisearch v2'de |
| **worker süreci** | opsiyonel (ayrı entrypoint) | AI işi web'i bloklarsa `node worker.js` ile ayrılır; kod değişmez |

### 1b. Kuyruk/Worker Stratejisi

**Öneri: DB tabanlı kuyruk (QueueJob tablosu). Redis + BullMQ'yu ertele.**

- Redis ~64-128 MB yer kaplar ve VPS'te tek tük iş için lüks.
- Kuyruk zaten transactional olmalı (iş + durum güncellemesi atomik) — DB kuyruk bunu bedava verir.
- `SELECT ... WHERE status='QUEUED' AND run_at<=now() ORDER BY priority LIMIT n FOR UPDATE SKIP LOCKED` (Postgres) /
  SQLite'ta tek worker ile `UPDATE ... RETURNING` deseni.
- **Fallback/yükseltme yolu:** `QueueProvider` arayüzü (`enqueue`, `claim`, `complete`, `fail`) —
  v2'de BullMQ implementasyonu eklenir, çağıran kod değişmez.
- Retry: `attempts/max_attempts` + üstel geri çekilme `run_at = now() + 2^attempts * 30s`.
- Dead-letter: `attempts >= max_attempts` → `DEAD` durumu + admin panelinde görünür + alert.

### 1c. Veritabanı Şeması (PostgreSQL + Prisma)

> Tüm modellerde ortak: `id`, `createdAt`, `updatedAt`, `deletedAt` (soft delete), `status` enum'u.
> Prisma'da inheritance olmadığı için alanlar açıkça tekrarlanır.

```prisma
// prisma/schema.prisma — Kantan hedef şeması (PostgreSQL)

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────────
// Enum'lar — her varlık için açık durum makinesi
// ─────────────────────────────────────────────────────────────────

enum SourceStatus {
  ACTIVE      // normal taramada
  PAUSED      // elle duraklatıldı
  ERROR       // art arda hata (devre kesici)
  RETIRED     // kalıcı kapandı
}

enum FeedStatus {
  ACTIVE
  PAUSED
  ERROR
}

enum RawItemStatus {
  NEW          // ham havuza yeni girdi
  NORMALIZED   // metin temizlendi, token/embedding hazır
  CLUSTERED    // bir Story'ye atandı
  SKIPPED      // eşik altı / filtre (küme kurulamadı)
  PURGED       // TTL doldu, fiziksel silinmeye aday
}

enum StoryStatus {
  DRAFTED       // AI sentez taslağı üretildi
  NEEDS_REVIEW  // telif riski / düşük özgünlük → insan onayı
  APPROVED      // onaylandı, yayın sırasında
  PUBLISHED     // yayında
  TAKEN_DOWN    // telif/yanlış haber nedeniyle kaldırıldı
  REJECTED      // reddedildi (AI veya insan)
  MERGED        // başka kümeye birleştirildi
}

enum ArticleStatus {
  DRAFT
  SCHEDULED
  PUBLISHED
  UNPUBLISHED
  TAKEN_DOWN
}

enum MediaLicense {
  AI_GENERATED  // tamamen üretim, telifsiz
  STOCK         // Unsplash/Pexels vb. lisanslı stok
  EMBED         // kaynak gömülü (referrer no-referrer)
  RSS_SOURCE    // kaynak görseli — riskli
  UNKNOWN
}

enum RoleName {
  OWNER      // tek kişi: admin@example.com
  ADMIN
  EDITOR
  MODERATOR
  VIEWER
}

enum ModerationType {
  APPROVE
  REJECT
  EDIT
  TAKEDOWN
  RESTORE
  MERGE
  SPLIT
  KILLSWITCH  // kaynak bazlı toplu kaldırma
}

enum TakeDownStatus {
  OPEN       // bildirim geldi
  ACTIONED   // içerik kaldırıldı
  APPEALED   // itiraz var
  DISMISSED  // haksız bildirim
  CLOSED     // dosya kapandı
}

enum PipelineStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum AiJobType {
  SYNTHESIZE   // çok kaynaklı sentez
  TRANSLATE    // en/es çeviri
  SUMMARIZE
  EMBEDDING    // benzerlik vektörü
  TTS          // sesli özet / podcast
  IMAGE_TAGS   // görsel sınıflandırma
}

enum AiJobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  DEAD         // dead-letter
}

enum PodcastStatus {
  DRAFT
  READY        // ses üretildi, onay bekliyor
  SCHEDULED
  PUBLISHED
  FAILED
}

// ─────────────────────────────────────────────────────────────────
// Kaynak katmanı + TELİF GÜVENLİK ALANLARI
// ─────────────────────────────────────────────────────────────────

model Source {
  id          String       @id @default(cuid())
  name        String
  slug        String       @unique
  websiteUrl  String?

  // ── Telif güvenlik katmanı (GÖREV 1e) ──
  rssTermsUrl         String?   // kaynak kullanım şartları sayfası
  aiTrainAllowed      Boolean @default(true)   // sentezde kullanılabilir mi
  fullTextAllowed     Boolean @default(false)  // tam metin işlenebilir mi (yalnız başlık+spot değil)
  attributionRequired Boolean @default(true)   // Kaynak adı gösterilmeli mi (tr fossasında gizliyiz)

  status      SourceStatus @default(ACTIVE)
  killedAt    DateTime?    // kill-switch anı
  killReason  String?      // kill-switch sebebi (audit'e de yazılır)
  notes       String?

  deletedAt   DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  feeds              Feed[]
  rawItems           RawItem[]
  storySources       StorySource[]
  moderationActions  ModerationAction[]

  @@index([status])
}

model Feed {
  id                 String     @id @default(cuid())
  sourceId           String
  url                String     @unique
  format             String?    // rss | atom | rdf
  categoryHint       String?    // LLM kategori döndürmezse fallback
  pollIntervalMin    Int        @default(10)
  lastFetchedAt      DateTime?
  lastErrorAt        DateTime?
  lastErrorMessage   String?
  consecutiveErrors  Int        @default(0)
  status             FeedStatus @default(ACTIVE)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  source    Source     @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  rawItems  RawItem[]

  @@index([status, lastFetchedAt])
}

// ─────────────────────────────────────────────────────────────────
// Ham havuz ve kümeleme
// ─────────────────────────────────────────────────────────────────

model RawItem {
  id               String        @id @default(cuid())
  feedId           String
  sourceId         String        // denormalize: kill-switch sorguları hızlı
  url              String
  urlHash          String        @unique   // md5(sourceId|url) — mevcut motorla uyumlu
  title            String
  contentRaw       String?       // orijinal HTML
  contentText      String?       // temizlenmiş düz metin (telif: yalnız işlenmek üzere)
  publishedAt      DateTime?
  fetchedAt        DateTime      @default(now())
  processedAt      DateTime?
  status           RawItemStatus @default(NEW)
  clusterStoryId   String?       // atandığı küme

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  feed    Feed   @relation(fields: [feedId], references: [id], onDelete: Cascade)
  cluster Story? @relation(fields: [clusterStoryId], references: [id], onDelete: SetNull)

  @@index([fetchedAt])
  @@index([status, fetchedAt])
  @@index([clusterStoryId])
}

model Story {
  id              String      @id @default(cuid())
  clusterKey      String?     @unique   // küme yeniden kurulabilir (merge/split)
  title           String                // sentez başlık (taslak)
  summary         String
  categoryId      String?
  status          StoryStatus @default(DRAFTED)
  sourcesCount    Int         @default(0)
  similarityScore Float?      // küme içi en yüksek çift benzerlik (cosine)
  originalityScore Float?     // LLM özgünlük öz-değerlendirmesi (0-1)
  copyrightRisk   Boolean     @default(false)  // RISKLI bayrağı
  riskReason      String?

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  category          Category?           @relation(fields: [categoryId], references: [id])
  storySources      StorySource[]
  rawItems          RawItem[]
  articles          Article[]
  moderationActions ModerationAction[]
  aiJobs            AiJob[]
  podcastEpisodes   PodcastEpisode[]

  @@index([status, createdAt])
  @@index([copyrightRisk])
}

// N:N kanıt tablosu — hangi kaynak, hangi linke dayanarak kümeye girdi
model StorySource {
  id              String   @id @default(cuid())
  storyId         String
  sourceId        String
  evidenceUrl     String   // kanıt: orijinal makale linki
  evidenceTitle   String?
  similarityScore Float?   // bu kaynağın kümeye benzerliği

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  story   Story  @relation(fields: [storyId], references: [id], onDelete: Cascade)
  source  Source @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@unique([storyId, sourceId])
  @@index([sourceId])
}

// ─────────────────────────────────────────────────────────────────
// Yayın katmanı (dil bağımsız kabuk + çeviriler)
// ─────────────────────────────────────────────────────────────────

model Article {
  id              String        @id @default(cuid())
  storyId         String?
  slug            String        @unique
  status          ArticleStatus @default(DRAFT)
  scheduledAt     DateTime?
  publishedAt     DateTime?
  canonicalUrl    String?
  ogImageUrl      String?
  sitemapPriority Float         @default(0.7)
  viewCount       Int           @default(0)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  story           Story?           @relation(fields: [storyId], references: [id], onDelete: SetNull)
  translations    ArticleTranslation[]
  tags            ArticleTag[]
  podcastEpisodes PodcastEpisode[]

  @@index([status, publishedAt])
}

model ArticleTranslation {
  id              String   @id @default(cuid())
  articleId       String
  locale          String   // tr | en | es
  title           String
  spot            String   // 1-2 cümle akış özeti
  body            String   // markdown (## alt başlıklı)
  metaTitle       String?
  metaDescription String?
  readingMinutes  Int?
  ttsAudioUrl     String?  // sesli özet (kişiselleştirilmiş TTS önbelleğine işaret)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  article Article @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@unique([articleId, locale])
  @@index([locale])
}

model Category {
  id        String  @id @default(cuid())
  slug      String  @unique
  nameTr    String
  nameEn    String
  nameEs    String
  sortOrder Int     @default(0)
  isActive  Boolean @default(true)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  stories Story[]
}

model Tag {
  id       String  @id @default(cuid())
  slug     String  @unique
  label    String
  isActive Boolean @default(true)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  articles ArticleTag[]
}

model ArticleTag {
  articleId String
  tagId     String

  createdAt DateTime @default(now())

  article Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([articleId, tagId])
}

// ─────────────────────────────────────────────────────────────────
// Medya — lisans tipi ve telif notu ZORUNLU
// ─────────────────────────────────────────────────────────────────

model MediaAsset {
  id          String       @id @default(cuid())
  kind        String       // image | audio
  url         String
  storageKey  String?      // disk/S3 anahtarı
  license     MediaLicense @default(UNKNOWN)
  licenseNote String       // ZORUNLU: lisans açıklaması / kaynak
  creditText  String?      // attribution_required ise gösterilecek metin
  width       Int?
  height      Int?
  bytes       Int?
  sha256      String?
  usageCount  Int          @default(0)

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  podcastEpisodes PodcastEpisode[]

  @@index([license])
}

// ─────────────────────────────────────────────────────────────────
// Kullanıcı / Rol / Denetim
// ─────────────────────────────────────────────────────────────────

model User {
  id               String    @id @default(cuid())
  email            String    @unique
  name             String?
  image            String?
  passwordHash     String?   // e-posta+şifre girişi (bcrypt)
  twoFactorSecret  String?   // TOTP (v1)
  twoFactorEnabled Boolean   @default(false)
  newsletterConsent Boolean  @default(false)
  selectedVoice    String    @default("default")
  status           String    @default("ACTIVE")
  lastLoginAt      DateTime?

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  roles              UserRole[]
  sessions           SessionLog[]
  moderationActions  ModerationAction[]
  auditLogs          AuditLog[]
}

model Role {
  id          String   @id @default(cuid())
  name        RoleName @unique
  description String?

  users UserRole[]
}

model UserRole {
  userId String
  roleId String

  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId])
}

model SessionLog {
  id        String   @id @default(cuid())
  userId    String
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

// Her moderasyon kararı — kim, ne zaman, hangi story, hangi gerekçe
model ModerationAction {
  id           String           @id @default(cuid())
  storyId      String?
  sourceId     String?          // kill-switch aksiyonları için
  actorUserId  String
  type         ModerationType
  reason       String?          // copyright | hallucination | other
  note         String?
  beforeJson   Json?            // değişiklik öncesi anlık görüntü
  afterJson    Json?

  createdAt DateTime @default(now())

  story  Story? @relation(fields: [storyId], references: [id], onDelete: Cascade)
  source Source? @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [actorUserId], references: [id])

  @@index([storyId, createdAt])
}

// Sistem geneli denetim kaydı — dışa aktarılabilir (JSON/CSV)
model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?   // null → sistem/cron
  actorLabel  String   @default("system") // system | cron | user
  action      String   // "story.publish", "source.kill", ...
  entityType  String
  entityId    String
  ip          String?
  userAgent   String?
  meta        Json?

  createdAt DateTime @default(now())

  user User? @relation(fields: [actorUserId], references: [id])

  @@index([entityType, entityId])
  @@index([createdAt])
}

// ─────────────────────────────────────────────────────────────────
// Telif bildirim yönetimi (Take-Down)
// ─────────────────────────────────────────────────────────────────

model TakeDown {
  id               String         @id @default(cuid())
  requesterName    String
  requesterEmail   String?
  noticeUrl        String?        // bildirimin kendisi (URL/doküman)
  reason           String         // copyright | defamasyon | yanlış bilgi | other
  claimDescription String
  status           TakeDownStatus @default(OPEN)
  noticeReceivedAt DateTime        @default(now())
  actionedAt       DateTime?
  appealNote       String?
  resolvedNote     String?
  affectedSlugs    String[]        // etkilenen makale slug'ları

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([status])
}

// ─────────────────────────────────────────────────────────────────
// Pipeline, kuyruk ve AI işleri
// ─────────────────────────────────────────────────────────────────

model PipelineRun {
  id             String         @id @default(cuid())
  trigger        String         // cron | manual | api
  idempotencyKey String?        @unique  // aynı tetiklemenin çift koşmasına karşı
  status         PipelineStatus @default(QUEUED)
  startedAt      DateTime?
  finishedAt     DateTime?
  stats          Json?          // {sources, staged, clusters, verified, published...}
  error          String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, createdAt])
}

// DB tabanlı genel kuyruk (GÖREV 1b) — BullMQ'ya geçişte arayüz aynı kalır
model QueueJob {
  id          String   @id @default(cuid())
  queue       String   // ingestion | ai | publish | media | podcast
  type        String   // "ingest.feed", "ai.synthesize", ...
  payload     Json
  status      String   @default("QUEUED") // QUEUED|RUNNING|SUCCEEDED|FAILED|DEAD
  priority    Int      @default(5)
  runAt       DateTime @default(now())
  attempts    Int      @default(0)
  maxAttempts Int      @default(3)
  lockedBy    String?  // worker kimliği
  lockedAt    DateTime?
  lastError   String?
  dedupeKey   String?  @unique // aynı işin tekrar sıraya girmesini engeller

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, priority, runAt])
}

model AiJob {
  id          String      @id @default(cuid())
  type        AiJobType
  status      AiJobStatus @default(QUEUED)
  storyId     String?
  model       String
  promptVersion Int       @default(1)
  payload     Json?
  result      Json?
  costUsd     Float?      // maliyet sayacı (admin paneli)
  attempts    Int         @default(0)
  durationMs  Int?
  error       String?

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  story Story? @relation(fields: [storyId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([type])
}

// ─────────────────────────────────────────────────────────────────
// Podcast — günlük otomatik bülten
// ─────────────────────────────────────────────────────────────────

model PodcastEpisode {
  id            String        @id @default(cuid())
  articleId     String?       // bağlı haber (opsiyonel)
  title         String
  script        String        // markdown senaryo (günlük bülten)
  locale        String        @default("tr")
  voiceKey      String        @default("default") // Voice Design persona
  audioAssetId  String?
  durationSec   Int?
  status        PodcastStatus @default(DRAFT)
  scheduledFor  DateTime?
  publishedAt   DateTime?
  enclosureUrl  String?       // podcast RSS enclosure

  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  article    Article?    @relation(fields: [articleId], references: [id], onDelete: SetNull)
  audioAsset MediaAsset? @relation(fields: [audioAssetId], references: [id])

  @@index([status, publishedAt])
}
```

### 1d. Durum Makinesi — RawItem → Yayın

```
NEW ──sistem──► NORMALIZED ──sistem──► CLUSTERED ──AI──► DRAFTED
                                                 │         │
                       AI (isValidStory=false)   │         ├──sistem(riskli)──► NEEDS_REVIEW
                                    ┌────────────▼───┐     │
                                    │    REJECTED    │◄────┤──insan(red)────────┐
                                    └────────────────┘     │                    │
                                                           ├──insan(onay) / sistem(oto, risksiz)──► APPROVED
                                                           │
NEEDS_REVIEW ──insan(onay)──► APPROVED ──sistem──► PUBLISHED ──insan(take-down)──► TAKEN_DOWN
                                                           ▲                        │
                                                           └──insan(restore)────────┘
CLUSTERED ──insan(merge)──► MERGED (başka kümeye katılır)
```

| Geçiş | Kim yapabilir | Kayıt |
|---|---|---|
| NEW → NORMALIZED | sistem | PipelineRun.stats |
| NORMALIZED → CLUSTERED | sistem | RawItem.clusterStoryId |
| CLUSTERED → DRAFTED | **AI** (sentez) | AiJob.result |
| CLUSTERED/DRAFTED → REJECTED | **AI** (isValidStory=false) veya insan | ModerationAction |
| DRAFTED → NEEDS_REVIEW | sistem (copyrightRisk veya originality < eşik) | Story.riskReason |
| DRAFTED → APPROVED | sistem (oto-yayın açıksa ve risksizse) veya insan | ModerationAction |
| NEEDS_REVIEW → APPROVED / REJECTED | **yalnız insan** | ModerationAction |
| APPROVED → PUBLISHED | sistem (yayıncı) | Article + AuditLog |
| PUBLISHED → TAKEN_DOWN | **yalnız insan** (sahip/editör) | ModerationAction + TakeDown |
| TAKEN_DOWN → PUBLISHED | **yalnız insan** (admin+) | ModerationAction |

### 1e. Telif Güvenlik Katmanı

1. **Kaynak başına lisans alanları** (Source): `rssTermsUrl`, `aiTrainAllowed`,
   `fullTextAllowed`, `attributionRequired`. `aiTrainAllowed=false` kaynağın
   öğeleri kümeye **hiç girmez** (ingestion'da düşer); `fullTextAllowed=false`
   kaynakta yalnız başlık+spot işlenir.
2. **Benzerlik skoru**: her StorySource için embedding cosine; `similarityScore`
   eşik (örn. > 0.90) üstünde kaynak metniyle aşırı örtüşme → `copyrightRisk=true`
   → `NEEDS_REVIEW`'a zorlanır, otomatik yayın **her koşulda kapalı**.
3. **Kill-switch**: Source.kill → o kaynağın tüm StorySource'ları işaretlenir,
   `sourcesCount < 3` kalan Story'ler otomatik `TAKEN_DOWN`; Moderate edilmiş
   makaleler sessizce yayından kalkar (mevcut sessiz kaldırma API'sinin geneli).
   Tümü AuditLog + ModerationAction(KILLSWITCH) ile kayıt altında.
4. **Görünür tarafta**: kaynak isimleri zaten gizli (telif); "✓ N kaynaktan
   doğrulandı" rozeti kalmaya devam eder. Kanıt linkleri yalnızca panelde.

### 1f. Ölçeklenme Yolu — Bugün Soyutla / Ertele

**Bugün soyutla (arayüz arkasına al):**
1. `QueueProvider` (enqueue/claim/complete/fail) — DB implementasyonu bugün, BullMQ yarın.
2. `StorageProvider` (put/get/sign) — bugün disk volume, yarın S3/R2.
3. `SearchProvider` (index/search) — bugün FTS5, yarın tsvector → Meilisearch.
4. `MailProvider` — bugün no-op/log, yarın kendi mail sunucusu (kota dostu kuyruklu).
5. LLM çağrıları `AiJob` arkasında — sağlayıcı değişimi (evren-llmapi → başka) tek adaptör.
6. URL yapısı `/{locale}/news/{slug}` — çok dilli SEO erken sabitlenir.

**Ertele (3 node'a kadar dokunma):**
- Redis, microservice ayrımı, Kubernetes, CDN katmanı (Cloudflare yeter),
  İHA/AA ücretli abonelik adaptörleri, çok bölge çoğaltma, websocket canlı akış.

---

## 2. GÖREV 2 — YÖNETİM PANELİ

**Genel:** `/[lang]/admin/*` rotaları. Cloudflare arkasında; robots.txt'te kapalı.
Auth: httpOnly cookie oturum + CSRF çift token. Klavye-öncelikli: `Cmd/Ctrl+K`
command palette (tüm modüller + haber arama). Tüm listeler: boş durum ("Henüz X yok"),
hata durumunda retry, iskelet yükleme.

**İzin matrisi (O=Owner, A=Admin, E=Editor, M=Moderator, V=Viewer):**

| Modül | O | A | E | M | V |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Onay Kuyruğu | ✓ | ✓ | onay/red | onay/red | – |
| Kaynak Yönetimi | ✓ | ✓ | ✓ (kill-switch hariç) | – | – |
| Kill-switch | ✓ | ✓ | – | – | – |
| İçerik Editörü | ✓ | ✓ | ✓ | taslak | – |
| Kümeleme Görünümü | ✓ | ✓ | ✓ | ✓ | ✓ (okuma) |
| Medya Kütüphanesi | ✓ | ✓ | ✓ | – | – |
| AI Ayarları | ✓ | ✓ | – | – | – |
| Podcast | ✓ | ✓ | ✓ | dinleme | – |
| Kullanıcı & Rol | ✓ | ✓ | – | – | – |
| Audit Log | ✓ | ✓ | – | – | – |
| Take-Down | ✓ | ✓ | aksiyon | aksiyon | – |
| Sistem | ✓ | ✓ | – | – | – |

### Modül Kartları (rota / API / kolonlar / kabul kriteri)

**1. Dashboard — `/tr/admin`**
- API: `GET /api/admin/metrics/overview` (son çekim/hata oranı/kuyruk derinliği/
  ortalama işleme süresi), `GET /api/admin/metrics/timeseries?window=24h`
- Kolonlar (kaynak sağlığı tablosu): Kaynak · Son Çekim · Hata % · Öğe/dk · Durum
- Kartlar: yayınlanan / bekleyen / riskli / dead-letter iş sayısı
- Kabul: sayfa < 1 sn yüklenir; veriler 30 sn önbellek; her sayı tıklanınca ilgili modüle gider.

**2. Onay Kuyruğu — `/tr/admin/queue`** ⭐ öncelik
- API: `GET /api/admin/queue?cursor&status=NEEDS_REVIEW`, `POST /api/admin/stories/:id/approve`,
  `POST .../reject`, `POST .../edit`, `POST /api/admin/queue/bulk` (id listesi + aksiyon)
- Kart kolonları: AI taslağı (başlık+spot) · kanıt linkleri (N kaynak) · similarityScore ·
  kategori tahmini · telif risk bayrağı · yaş (dk)
- Kısayollar: `J/K` gezinme, `A` onayla, `R` reddet, `E` düzenle, `Shift+A` toplu onay (seçili)
- Kabul: 50 kart < 500 ms; klavye ile fareye dokunmadan 10 kart/dk işlenebilir;
  her aksiyon ModerationAction üretir; toplu işlem atomik (hepsi ya hiçbiri).

**3. Kaynak Yönetimi — `/tr/admin/sources`**
- API: `GET/POST /api/admin/sources`, `PATCH/DELETE /api/admin/sources/:id`,
  `POST /api/admin/sources/:id/test` (fetch+parse preview, ilk 3 başlık döner),
  `POST /api/admin/sources/:id/kill` (kill-switch, onay modalı + sebep zorunlu)
- Kolonlar: Ad · URL · poll aralığı · kategori · lisans alanları (4 toggle) ·
  aktif/pasif · son hata · içeriğini kaldır (kill)
- Kabul: test düğmesi canlı RSS'i dener ve önizleme döner; kill-switch kaynakla
  ilişkili tüm yayınları sessizce kaldırır + audit kaydı düşer; hata veren kaynak
  5 ardışık hatada otomatik ERROR durumuna düşer.

**4. İçerik Editörü — `/tr/admin/articles/:id`**
- API: `GET/PUT /api/admin/articles/:id`, `POST .../publish`, `POST .../schedule`
- Dil sekmeleri (tr/en/es) → ArticleTranslation; slug otomatik + düzenlenebilir;
  SEO alanları; JSON-LD NewsArticle canlı önizleme
- Kabul: çeviri eksikse yalnız girilen dil yayınlanır; slug çakışması hatası net;
  zamanlama dakika hassasiyetinde; otomatik kaydetme 5 sn'de bir.

**5. Kümeleme Görünümü — `/tr/admin/stories/:id`**
- API: `GET /api/admin/stories/:id` (RawItem'lar + benzerlik matrisi),
  `POST /api/admin/stories/:id/merge` (hedef id), `POST .../split`
- Kolonlar: RawItem başlık · kaynak · benzerlik · zaman
- Kabul: birleştirme sonrası sentez yeniden tetiklenir (AiJob); ayırma iki kümeye
  böler ve her biri yeniden değerlendirilir.

**6. Medya Kütüphanesi — `/tr/admin/media`**
- API: `GET/POST /api/admin/media`, `PATCH/DELETE /:id` (soft)
- Kolonlar: önizleme · lisans tipi · telif notu (ZORUNLU alan, boşsa kayıt reddedilir) ·
  kullanım sayısı · boyut
- Kabul: `licenseNote` boşken POST 422; kullanımda olan var silinemez (soft delete + uyarı).

**7. AI Ayarları — `/tr/admin/ai`**
- API: `GET/PUT /api/admin/ai/settings`, `GET /api/admin/ai/prompts` (sürüm listesi),
  `POST /api/admin/ai/prompts/:version/activate`
- Kolonlar: prompt şablonu sürümleri · model · sıcaklık · özgünlük eşiği ·
  oto-yayın aç/kapa · toplam maliyet (AiJob.costUsd toplamı)
- Kabul: yeni prompt sürümü eskiyi geçersiz kılmaz (geri alınabilir); maliyet sayacı
  günlük/aylık kırılım verir; eşik değişikliği sadece yeni Story'lere uygulanır.

**8. Podcast — `/tr/admin/podcast`**
- API: `POST /api/admin/podcast/generate` (günün doğrulanmış haberlerinden senaryo,
  AiJob TTS), `GET .../episodes`, `POST .../episodes/:id/publish`
- Kolonlar: bölüm · senaryo · ses · süre · durum · yayın zamanı
- Kabul: taslak dinlenebilir; yayın RSS enclosure otomatik eklenir; ses seçimi
  Voice Design persona listesinden.

**9. Kullanıcı & Rol — `/tr/admin/users`** (Owner/Admin)
- API: `GET /api/admin/users`, `POST /:id/roles`, `POST /:id/disable`, `GET /:id/sessions`
- Kolonlar: isim · e-posta · roller · 2FA durumu · son oturum · kayıt
- Kabul: rol değişimi anında etkili; 2FA zorunlu kılınabilir; oturum logları 90 gün.

**10. Audit Log — `/tr/admin/audit`**
- API: `GET /api/admin/audit?actor&entity&action&from&to&cursor`, `GET .../export?format=csv`
- Kabul: filtre kombinasyonları cursor sayfalamayla; CSV export 10k satır < 5 sn;
  kayıtlar değiştirilemez (append-only).

**11. Take-Down — `/tr/admin/takedowns`**
- API: `GET/POST /api/admin/takedowns`, `POST /:id/action` (etkilenen slug'ları toplu kaldır),
  `POST /:id/appeal`, `POST /:id/close`
- Kabul: action, `affectedSlugs` içindeki tüm makaleleri `TAKEN_DOWN` yapar +
  TakeDown kaydı ACTIONED; itiraz notu eklenebilir; zaman çizelgesi görünür.

**12. Sistem — `/tr/admin/system`**
- API: `POST /api/admin/system/pipeline/run` (**Idempotency-Key başlığı zorunlu**),
  `POST .../queue/clear-dead`, `POST .../search/reindex`, `POST .../sitemap/rebuild`,
  `PUT .../maintenance`
- Kabul: çift tıklama tek koşu üretir (idempotency); bakım modu 503 + özel sayfa;
  her aksiyon onay modalı + audit.

**13. Analytics — `/tr/admin/analytics`** (Matomo API'den)
- API: `GET /api/admin/analytics/top-read?range=7d`, `.../categories`, `.../source-efficiency`
  (çekilen/yayınlanan oranı — Source bazında)
- Kabul: Matomo erişilemezse hata durumu + retry; veri 1 saat önbellek.

---

## 3. GÖREV 3 — TEKNİK KURALLAR (Özet)

- **API:** REST + zod (istek/yanıt şemaları tek yerde), cursor sayfalama
  (`?cursor=&limit=`), rate limit (IP+route bazlı, DB sayaç), idempotency key
  (pipeline tetiklemelerinde `Idempotency-Key` başlığı → PipelineRun.idempotencyKey).
- **Auth:** httpOnly cookie oturum + CSRF (double-submit cookie). JWT gerekmez.
- **Yıkıcı işlemler:** soft delete + audit log + onay modalı (3'lü zorunlu).
- **AI çağrıları:** asla senkron değil → AiJob kuyruğu; retry 2^n geri çekilme, 3 deneme
  sonra DEAD; görsel işleme arka planda.
- **Gözlemlenebilirlik:** yapılandırılmış JSON log (pino), `GET /health` (DB+queue+LLM ping),
  `GET /metrics` (Prometheus format: kuyruk derinliği, iş süreleri, hata oranları).

## 4. Klasör Yapısı

```
news/
├─ prisma/                    # şema + migration'lar
├─ src/
│  ├─ app/                    # Next.js App Router
│  │  ├─ [lang]/              # herkese açık: feed, news/[slug], legal
│  │  ├─ [lang]/admin/        # panel: dashboard, queue, sources, articles,
│  │  │                       # stories, media, ai, podcast, users, audit,
│  │  │                       # takedowns, system, analytics
│  │  └─ api/                 # REST (zod + rate limit + idempotency)
│  ├─ modules/
│  │  ├─ ingestion/           # poller, feed parser, kaynak lisans filtresi
│  │  ├─ clustering/          # DF-filtreli kümeleme, embedding, merge/split
│  │  ├─ ai/                  # LLM/TTS adaptörü, prompt sürümleri, maliyet
│  │  ├─ publish/             # article, sitemap, RSS, JSON-LD
│  │  ├─ media/               # StorageProvider (disk→S3), lisans doğrulama
│  │  ├─ search/              # SearchProvider (FTS5→tsvector→Meili)
│  │  ├─ podcast/             # senaryo üretimi, TTS, enclosure
│  │  └─ notification/        # MailProvider (no-op → SMTP), web push (v2)
│  ├─ core/
│  │  ├─ queue/               # QueueProvider + DB implementasyonu
│  │  ├─ db/                  # prisma client, transaction yardımcıları
│  │  ├─ auth/                # oturum, CSRF, roller, izin guard'ları
│  │  ├─ logging/             # pino JSON log
│  │  └─ http/                # zod middleware, rate limit, hale (API hatası)
│  ├─ components/             # UI (panel + public)
│  └─ lib/                    # paylaşılan saf yardımcılar
├─ docs/                      # bu doküman + ADR'ler
├─ Dockerfile
└─ docker-compose.yml         # app + (v2: worker, postgres, redis)
```

## 5. GÖREV 4 — YOL HARİTASI

### MVP — 1 hafta (öncelik: telif riskini sıfırla + onay kuyruğu)
**Bugün yapılacak 3 şey:**
1. **Source'a telif alanları + kill-switch** (rssTermsUrl/aiTrainAllowed/fullTextAllowed/
   attributionRequired + toplu kaldırma) — mevcut yarı yapılmış sessiz-kaldırma API'si
   bunun üzerine tamamlanır.
2. **Onay Kuyruğu v0:** NEEDS_REVIEW listesi + J/K/A/R kısayolları + ModerationAction kaydı
   (mevcut admin paneline yeni sekme).
3. **QueueJob tablosu + worker döngüsü** (mevcut in-memory job DB'ye taşınır; retry+DLQ).

MVP kapsamı ayrıca: similarityScore hesabı (mevcut token-Jaccard cosine'a yükseltilir),
riskli Story'nin oto-yayın dışına alınması, AuditLog (append-only).

### v1 — 1 ay
**İlk 3 şey:** (1) SQLite → PostgreSQL migrasyonu + Prisma şema geçişi,
(2) panel modüllerinin tamamı (editör, kümeleme, medya, takedown, kullanıcı/rol, audit),
(3) podcast günlük bülten (senaryo + TTS + RSS enclosure).
Ayrıca: es locale, Article/Translation yayına geçirilir (SEO + JSON-LD),
PWA + OpenDyslexic + font_scale, 2FA, /metrics.

### v2 — ölçeklenme
3 node, Redis+BullMQ (QueueProvider takası), Meilisearch, S3/R2 medya,
mail bildirimleri (kendi sunucu, kota dostu), İHA/AA ücretli kaynak adaptörleri,
Matomo analytics paneli.
