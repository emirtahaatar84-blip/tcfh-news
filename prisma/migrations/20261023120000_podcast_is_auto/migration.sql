-- PodcastEpisode: radyo cron'unun ürettiği otomatik bölümleri işaretle
-- (otomatik yayın + süreli saklama için)
ALTER TABLE "PodcastEpisode" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;
