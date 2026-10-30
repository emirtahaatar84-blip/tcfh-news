-- Otomatik kategori/etiket sınıflandırma sonuçları (İŞ 3).
ALTER TABLE "NewsItem" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "NewsItem" ADD COLUMN "categoryScores" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "classifiedAt" DATETIME;
