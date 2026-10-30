-- Video haberleri: YouTube linkinden üretilen, owner onayı (oynatma kilidi)
-- ile yayımlanan haberler. NewsItem akışı video kökenini isVideo/youtubeId
-- ile bilir.

-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN "isVideo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NewsItem" ADD COLUMN "youtubeId" TEXT;

-- CreateTable
CREATE TABLE "VideoNews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "videoTitle" TEXT,
    "channel" TEXT,
    "thumbnailUrl" TEXT,
    "transcript" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "content" TEXT,
    "category" TEXT,
    "readTime" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "playedAt" DATETIME,
    "publishedAt" DATETIME,
    "newsItemId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoNews_youtubeId_key" ON "VideoNews"("youtubeId");
