-- Çoklu LLM sağlayıcı desteği (açık kaynak).
ALTER TABLE "SystemSettings" ADD COLUMN "llmProvider" TEXT NOT NULL DEFAULT 'openai';
-- Mevcut kurulumlar OpenAI uyumlu özel uçlar kullanıyorsa doğru etiketi ver.
UPDATE "SystemSettings"
   SET "llmProvider" = 'openai-compatible'
 WHERE "providerUrl" NOT IN ('https://api.openai.com/v1', 'https://api.anthropic.com/v1',
                             'https://generativelanguage.googleapis.com/v1beta',
                             'https://api.deepseek.com/v1')
   AND "providerUrl" LIKE 'https://%';
UPDATE "SystemSettings" SET "siteName" = 'Micro-News' WHERE "siteName" LIKE '%emirtahaatar%';
