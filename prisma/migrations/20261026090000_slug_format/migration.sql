-- Yeni URL şeması: /haber/<slug> ve /portre/<slug>.
-- SQLite'ta UNIQUE indeks birden fazla NULL'a izin verir; bu yüzden
-- mevcut kayıtlar backfill edilene kadar slug NULL kalabilir.
ALTER TABLE "NewsItem" ADD COLUMN "slug" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "imageCredit" TEXT;
CREATE UNIQUE INDEX "NewsItem_slug_key" ON "NewsItem"("slug");

ALTER TABLE "Portrait" ADD COLUMN "slugHistory" TEXT NOT NULL DEFAULT '[]';
