-- Çoklu LLM sağlayıcı desteği (açık kaynak).
ALTER TABLE "SystemSettings" ADD COLUMN "llmProvider" TEXT NOT NULL DEFAULT 'openai';
UPDATE "SystemSettings" SET "siteName" = 'Micro-News' WHERE "siteName" LIKE '%emirtahaatar%';
