-- Münazara modülü (Ek Bölüm 11): konu dosyaları, kaynaklar, doğrulanmış
-- RSS kaynakları ve MUS değerlendirmeli adaylar. Kullanıcı verisi yoktur.

CREATE TABLE "DebateTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'karma',
    "category" TEXT NOT NULL DEFAULT 'Gündem',
    "motionText" TEXT NOT NULL,
    "motionType" TEXT NOT NULL DEFAULT 'politika',
    "motionScope" TEXT NOT NULL DEFAULT 'tr',
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "controversy" INTEGER NOT NULL DEFAULT 3,
    "infoNeed" INTEGER NOT NULL DEFAULT 3,
    "recencyDays" INTEGER NOT NULL DEFAULT 3,
    "whyNow" TEXT NOT NULL DEFAULT '[]',
    "governmentThesis" TEXT NOT NULL DEFAULT '[]',
    "oppositionThesis" TEXT NOT NULL DEFAULT '[]',
    "keyClash" TEXT NOT NULL DEFAULT '[]',
    "burdens" TEXT NOT NULL DEFAULT '{}',
    "glossary" TEXT NOT NULL DEFAULT '[]',
    "faqs" TEXT NOT NULL DEFAULT '[]',
    "conflictNote" TEXT,
    "levelNote" TEXT,
    "musScore" INTEGER NOT NULL DEFAULT 0,
    "musBreakdown" TEXT NOT NULL DEFAULT '{}',
    "musReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "editorPin" INTEGER NOT NULL DEFAULT 0,
    "readingMinutes" INTEGER NOT NULL DEFAULT 7,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DebateTopic_slug_key" ON "DebateTopic"("slug");
CREATE INDEX "DebateTopic_status_publishedAt_idx" ON "DebateTopic"("status", "publishedAt");
CREATE INDEX "DebateTopic_level_status_publishedAt_idx" ON "DebateTopic"("level", "status", "publishedAt");
CREATE INDEX "DebateTopic_category_status_publishedAt_idx" ON "DebateTopic"("category", "status", "publishedAt");

CREATE TABLE "DebateSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "accessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supports" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DebateSource_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "DebateTopic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DebateSource_debateId_idx" ON "DebateSource"("debateId");

CREATE TABLE "DebateFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "lastItemAt" DATETIME,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);

CREATE UNIQUE INDEX "DebateFeed_url_key" ON "DebateFeed"("url");
CREATE INDEX "DebateFeed_status_idx" ON "DebateFeed"("status");

CREATE TABLE "DebateCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "sourceName" TEXT NOT NULL DEFAULT '',
    "publishedAt" DATETIME,
    "musScore" INTEGER NOT NULL DEFAULT 0,
    "musBreakdown" TEXT NOT NULL DEFAULT '{}',
    "musReason" TEXT,
    "motionText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DebateCandidate_sourceKey_key" ON "DebateCandidate"("sourceKey");
CREATE INDEX "DebateCandidate_status_musScore_idx" ON "DebateCandidate"("status", "musScore");
CREATE INDEX "DebateCandidate_feedUrl_idx" ON "DebateCandidate"("feedUrl");
