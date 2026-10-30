-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_NewsItem" ("category", "createdAt", "hash", "id", "sourceName", "sourceUrl", "summary", "title") SELECT "category", "createdAt", "hash", "id", "sourceName", "sourceUrl", "summary", "title" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE UNIQUE INDEX "NewsItem_hash_key" ON "NewsItem"("hash");
CREATE INDEX "NewsItem_createdAt_idx" ON "NewsItem"("createdAt");
CREATE INDEX "NewsItem_category_createdAt_idx" ON "NewsItem"("category", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
