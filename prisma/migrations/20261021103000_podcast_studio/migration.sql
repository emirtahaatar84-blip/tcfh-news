-- YZ Podcast Stüdyosu ("Potkes"): owner konu/mod seçer → YZ iki+ kişilik
-- konuşma senaryosu yazar → owner düzenler → ses üretilir (her karakterin
-- sabit voiceKey'i) → owner dinlemeden (playedAt kilidi) yayımlayamaz.

-- CreateTable
CREATE TABLE "PodcastEpisode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "mode" TEXT NOT NULL,
    "category" TEXT,
    "topic" TEXT,
    "guests" TEXT,
    "script" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "audio" BLOB,
    "audioDurationSec" INTEGER,
    "playedAt" DATETIME,
    "publishedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
