-- FAZ 1: güven ve doğrulama temeli.
ALTER TABLE "NewsItem" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "NewsItem" ADD COLUMN "verifiedSourceCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NewsItem" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "updatedAt" DATETIME;
ALTER TABLE "NewsItem" ADD COLUMN "factCheckStatus" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "factCheckNotes" TEXT;

-- Geriye dönük doldurma: ham kaynak sayısı doğrulanmış
-- sayı olarak kabul edilir (kaynağı olmayanlar 1).
UPDATE "NewsItem" SET "verifiedSourceCount" = CASE WHEN "sourcesCount" > 0 THEN "sourcesCount" ELSE 1 END;
UPDATE "NewsItem" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
UPDATE "NewsItem" SET "aiGenerated" = 1 WHERE "aiGenerated" IS NULL OR "aiGenerated" = 0;

CREATE INDEX "NewsItem_contentHash_idx" ON "NewsItem"("contentHash");

CREATE TABLE "NewsReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "newsId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "ipHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NewsReport_newsId_idx" ON "NewsReport"("newsId");
CREATE INDEX "NewsReport_createdAt_idx" ON "NewsReport"("createdAt");
CREATE INDEX "NewsReport_ipHash_createdAt_idx" ON "NewsReport"("ipHash","createdAt");
