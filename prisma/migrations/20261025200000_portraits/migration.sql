-- Portre modülü: aday hikâyeler, portreler, kaynaklar ve çalıştırma kayıtları.

CREATE TABLE "PortraitCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT 'kantan.news',
    "sourceUrl" TEXT NOT NULL,
    "originalUrl" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "publishedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" TEXT NOT NULL DEFAULT '{}',
    "scoreReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "failureReason" TEXT,
    "portraitId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PortraitCandidate_sourceKey_key" ON "PortraitCandidate"("sourceKey");
CREATE INDEX "PortraitCandidate_status_score_idx" ON "PortraitCandidate"("status", "score");
CREATE INDEX "PortraitCandidate_publishedAt_idx" ON "PortraitCandidate"("publishedAt");

CREATE TABLE "Portrait" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "category" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT 'olay',
    "subjectName" TEXT,
    "coverImageUrl" TEXT,
    "coverImageCaption" TEXT,
    "coverImageCredit" TEXT,
    "whyNow" TEXT NOT NULL DEFAULT '[]',
    "timeline" TEXT NOT NULL DEFAULT '[]',
    "keyFacts" TEXT NOT NULL DEFAULT '[]',
    "quote" TEXT,
    "faqs" TEXT NOT NULL DEFAULT '[]',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "readingMinutes" INTEGER NOT NULL DEFAULT 5,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewNotes" TEXT,
    "originStoryUrl" TEXT,
    "originSource" TEXT NOT NULL DEFAULT 'kantan.news',
    "feedScore" INTEGER,
    "publishedAt" DATETIME,
    "updateNote" TEXT,
    "removedAt" DATETIME,
    "removalReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Portrait_slug_key" ON "Portrait"("slug");
CREATE INDEX "Portrait_status_publishedAt_idx" ON "Portrait"("status", "publishedAt");
CREATE INDEX "Portrait_category_idx" ON "Portrait"("category");
CREATE INDEX "Portrait_subjectType_idx" ON "Portrait"("subjectType");

CREATE TABLE "PortraitSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portraitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "accessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'news',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "domain" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "PortraitSource_portraitId_fkey" FOREIGN KEY ("portraitId") REFERENCES "Portrait" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PortraitSource_portraitId_idx" ON "PortraitSource"("portraitId");

CREATE TABLE "PortraitRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "fresh" INTEGER NOT NULL DEFAULT 0,
    "scored" INTEGER NOT NULL DEFAULT 0,
    "queued" INTEGER NOT NULL DEFAULT 0,
    "published" INTEGER NOT NULL DEFAULT 0,
    "review" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT
);

CREATE INDEX "PortraitRun_startedAt_idx" ON "PortraitRun"("startedAt");
