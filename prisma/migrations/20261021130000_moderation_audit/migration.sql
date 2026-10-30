-- Doğrulama kaldırma + yumuşak moderasyon + saatlik kalite denetimi.
--
-- NewsItem artık silinmez: owner veya saatlik gemma denetimi (gemma-audit)
-- tarafından yumuşak kaldırılır (removedAt dolu = public akışta görünmez).
-- qualityScore/auditedAt saatlik denetçinin (gemma-4-31b) sonucunu taşır.

ALTER TABLE "NewsItem" ADD COLUMN "removedAt" DATETIME;
ALTER TABLE "NewsItem" ADD COLUMN "removalReason" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "removedBy" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "qualityScore" INTEGER;
ALTER TABLE "NewsItem" ADD COLUMN "auditedAt" DATETIME;

CREATE INDEX "NewsItem_removedAt_idx" ON "NewsItem"("removedAt");
CREATE INDEX "NewsItem_auditedAt_idx" ON "NewsItem"("auditedAt");

-- Potkes tek tık: bölüm üretiminde seçilen haber id'leri (JSON dizi).
ALTER TABLE "PodcastEpisode" ADD COLUMN "newsIds" TEXT;
