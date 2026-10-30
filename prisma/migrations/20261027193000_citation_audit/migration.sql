-- İŞ 4 — Atıf denetim izi, kara liste ve otomatik eşik yükseltmesi.
ALTER TABLE "SystemSettings" ADD COLUMN "citationThreshold" REAL NOT NULL DEFAULT 0.72;

CREATE TABLE "Citation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromKind" TEXT NOT NULL,
  "fromId" TEXT NOT NULL,
  "toKind" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "score" REAL NOT NULL,
  "entities" TEXT NOT NULL DEFAULT '[]',
  "anchor" TEXT,
  "rule" TEXT NOT NULL DEFAULT 'auto',
  "reviewed" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Citation_fromKind_fromId_toKind_toId_key" ON "Citation"("fromKind","fromId","toKind","toId");
CREATE INDEX "Citation_createdAt_idx" ON "Citation"("createdAt");
CREATE INDEX "Citation_reviewed_idx" ON "Citation"("reviewed");

CREATE TABLE "CitationBlacklist" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromKind" TEXT NOT NULL,
  "fromId" TEXT NOT NULL,
  "toKind" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CitationBlacklist_fromKind_fromId_toKind_toId_key" ON "CitationBlacklist"("fromKind","fromId","toKind","toId");
