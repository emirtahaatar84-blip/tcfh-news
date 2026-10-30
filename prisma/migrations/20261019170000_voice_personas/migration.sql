-- Voice personas: user preference + generic TTS cache.

-- AlterTable: preferred Sesli Özet voice (persona key).
ALTER TABLE "User" ADD COLUMN "selectedVoice" TEXT NOT NULL DEFAULT 'default';

-- CreateTable: generic TTS cache (replaces the news-only NewsAudio table).
CREATE TABLE "TtsCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "TtsCache_cacheKey_key" ON "TtsCache"("cacheKey");

-- DropTable: superseded by TtsCache (audio is now cached per persona too).
DROP TABLE "NewsAudio";
