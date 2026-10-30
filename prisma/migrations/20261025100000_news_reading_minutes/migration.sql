-- Okuma süresi filtresi için türetilmiş sütun (yaklaşık 1200 karakter ≈ 1 dk).
ALTER TABLE "NewsItem" ADD COLUMN "readingMinutes" INTEGER NOT NULL DEFAULT 1;

UPDATE "NewsItem"
SET "readingMinutes" = MAX(
  1,
  CAST((LENGTH(COALESCE("detailedContent", "summary")) / 1200) + 1 AS INTEGER)
);

CREATE INDEX "NewsItem_readingMinutes_idx" ON "NewsItem"("readingMinutes");
