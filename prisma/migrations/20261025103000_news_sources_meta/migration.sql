-- Kaynak kartı için meta veri (ad, dış link, alınma saati).
ALTER TABLE "NewsItem" ADD COLUMN "sourcesMeta" TEXT NOT NULL DEFAULT '[]';
