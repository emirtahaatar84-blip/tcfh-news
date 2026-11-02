-- HABER YAYILMA MOTORU: kanal bazlı dağıtım izleme.
CREATE TABLE "DistributionLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "newsId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "dedupeKey" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" DATETIME,
  "detail" TEXT,
  "error" TEXT,
  "durationMs" INTEGER,
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DistributionLog_dedupeKey_key" ON "DistributionLog"("dedupeKey");
CREATE INDEX "DistributionLog_newsId_idx" ON "DistributionLog"("newsId");
CREATE INDEX "DistributionLog_status_nextRetryAt_idx" ON "DistributionLog"("status","nextRetryAt");
CREATE INDEX "DistributionLog_channel_status_idx" ON "DistributionLog"("channel","status");
CREATE INDEX "DistributionLog_createdAt_idx" ON "DistributionLog"("createdAt");
