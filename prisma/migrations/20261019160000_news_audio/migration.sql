-- Cached TTS audio ("Sesli Özet") for news stories.

CREATE TABLE "NewsAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "NewsAudio_newsId_key" ON "NewsAudio"("newsId");
