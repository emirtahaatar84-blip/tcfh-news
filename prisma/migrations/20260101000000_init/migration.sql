-- CreateTable
CREATE TABLE "RSSSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'World',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "siteName" TEXT NOT NULL DEFAULT 'Mikro Haber',
    "providerUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "modelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "promptTemplate" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RSSSource_url_key" ON "RSSSource"("url");

-- CreateIndex
CREATE INDEX "RSSSource_isActive_idx" ON "RSSSource"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_hash_key" ON "NewsItem"("hash");

-- CreateIndex
CREATE INDEX "NewsItem_createdAt_idx" ON "NewsItem"("createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_category_createdAt_idx" ON "NewsItem"("category", "createdAt");
