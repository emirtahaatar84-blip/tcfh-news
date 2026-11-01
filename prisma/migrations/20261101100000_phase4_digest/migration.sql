-- FAZ 4: günlük özet, Telegram aboneleri, token kullanımı.

CREATE TABLE "DailyDigest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "newsIds" TEXT NOT NULL DEFAULT '[]',
  "audioUrl" TEXT,
  "audioSeconds" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DailyDigest_date_key" ON "DailyDigest"("date");
CREATE INDEX "DailyDigest_createdAt_idx" ON "DailyDigest"("createdAt");

CREATE TABLE "TelegramSubscriber" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chatId" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'tr',
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TelegramSubscriber_chatId_key" ON "TelegramSubscriber"("chatId");
CREATE INDEX "TelegramSubscriber_active_idx" ON "TelegramSubscriber"("active");

CREATE TABLE "TokenUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TokenUsage_date_idx" ON "TokenUsage"("date");
CREATE INDEX "TokenUsage_date_model_idx" ON "TokenUsage"("date","model");
