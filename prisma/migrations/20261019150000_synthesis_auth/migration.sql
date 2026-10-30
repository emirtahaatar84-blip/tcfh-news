-- Independent Multi-Source News Synthesis Engine:
-- NextAuth tables, RawFeedItem staging buffer and multi-source NewsItem.

-- CreateTable (NextAuth / Auth.js v5)
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "newsletterConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable: staging buffer for raw RSS items (purged after 2 hours)
CREATE TABLE "RawFeedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- AlterTable: synthesized story fields
ALTER TABLE "NewsItem" ADD COLUMN "detailedContent" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "sourcesCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "NewsItem" ADD COLUMN "sourcesList" TEXT NOT NULL DEFAULT '[]';

-- Backfill: legacy single-source rows become 1-source stories.
UPDATE "NewsItem" SET "sourcesCount" = 1;
UPDATE "NewsItem" SET "sourcesList" = json_array("sourceName");

-- Redefine columns: drop single-source fields (indexes first).
DROP INDEX IF EXISTS "NewsItem_hash_key";
ALTER TABLE "NewsItem" DROP COLUMN "hash";
ALTER TABLE "NewsItem" DROP COLUMN "sourceName";
ALTER TABLE "NewsItem" DROP COLUMN "sourceUrl";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "RawFeedItem_hash_key" ON "RawFeedItem"("hash");
CREATE INDEX "RawFeedItem_fetchedAt_idx" ON "RawFeedItem"("fetchedAt");
CREATE INDEX "RawFeedItem_processedAt_idx" ON "RawFeedItem"("processedAt");

-- Data: Turkish category vocabulary.
UPDATE "NewsItem" SET "category" = CASE "category"
    WHEN 'Tech' THEN 'Teknoloji'
    WHEN 'Economy' THEN 'Ekonomi'
    WHEN 'World' THEN 'Dünya'
    WHEN 'Politics' THEN 'Siyaset'
    WHEN 'Sports' THEN 'Spor'
    WHEN 'Culture' THEN 'Kültür'
    WHEN 'Health' THEN 'Sağlık'
    WHEN 'Science' THEN 'Bilim'
    WHEN 'Other' THEN 'Diğer'
    ELSE "category"
END;

UPDATE "RSSSource" SET "category" = CASE "category"
    WHEN 'Tech' THEN 'Teknoloji'
    WHEN 'Economy' THEN 'Ekonomi'
    WHEN 'World' THEN 'Dünya'
    WHEN 'Politics' THEN 'Siyaset'
    WHEN 'Sports' THEN 'Spor'
    WHEN 'Culture' THEN 'Kültür'
    WHEN 'Health' THEN 'Sağlık'
    WHEN 'Science' THEN 'Bilim'
    WHEN 'Other' THEN 'Diğer'
    ELSE "category"
END;

-- Replace the legacy single-source prompt template with the multi-source
-- synthesis prompt (only when the stored template is still an old one).
UPDATE "SystemSettings" SET "promptTemplate" = 'You are a lead editor for an independent, objective news agency. You are given 3 or more articles from different news outlets covering the same event.

Tasks:
1. Verify if these articles describe the same event.
2. Synthesize an objective, neutral, fact-based news story in Turkish using your own words. Do NOT copy phrases verbatim from any single source. Write as an independent, objective news organization.
3. Return a strict JSON response:
{
  "isValidStory": true,
  "title": "Sentezlenmiş Tarafsız Başlık",
  "category": "Teknoloji|Gündem|Ekonomi|Siyaset|Spor|Bilim|Dünya|Sağlık|Kültür|Diğer",
  "summary": "1-2 cümlelik tüy gibi hafif akış özeti.",
  "detailedContent": "## Alt Başlık 1\nDetaylı açıklama...\n\n## Alt Başlık 2\nDiğer açıklama..."
}

If the articles clearly describe different events, return { "isValidStory": false }.

Articles:
{articles}' WHERE "promptTemplate" NOT LIKE '%isValidStory%';

-- Defaults: DeepSeek synthesis model (only replace untouched defaults).
UPDATE "SystemSettings" SET "modelName" = 'deepseek-v4-flash' WHERE "modelName" = 'gpt-4o-mini';
UPDATE "SystemSettings" SET "providerUrl" = 'https://api.deepseek.com/v1' WHERE "providerUrl" = 'https://api.openai.com/v1';

-- Branding: site name doubles as the dynamic sidebar logo.
UPDATE "SystemSettings" SET "siteName" = 'news.emirtahaatar.com.tr' WHERE "id" = 1;
