import type { SystemSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_PROMPT_TEMPLATE = `You are given 1 or more articles (possibly from a single outlet) covering the same event.

Tasks:
1. Verify if these articles describe the same event.
2. Synthesize an objective, neutral, fact-based news story in Turkish using your own words. Do NOT copy phrases verbatim from any single source. Write as an independent, objective news organization.
3. Return a strict JSON response:
{
  "isValidStory": true,
  "title": "Sentezlenmiş Tarafsız Başlık",
  "category": "Teknoloji|Gündem|Ekonomi|Siyaset|Spor|Bilim|Dünya|Sağlık|Kültür|Diğer",
  "summary": "1-2 cümlelik tüy gibi hafif akış özeti.",
  "detailedContent": "## Alt Başlık 1\\nDetaylı açıklama...\\n\\n## Alt Başlık 2\\nDiğer açıklama..."
}

If a GEÇMİŞ BAĞLAM (past context) block is present, use ONLY those headlines to add chronological background ("Önceki gelişmeler") to detailedContent. Never present past events as today's news, and never invent facts beyond the given headlines.

Verification guidance: articles from different outlets may phrase the same event differently and may contain minor discrepancies in details, numbers or emphasis — this is normal and expected. Judge whether the CORE event (who did what) is the same, not the wording. Only return { "isValidStory": false } when the articles clearly describe genuinely different events.

Articles:
{articles}`;

export const DEFAULT_SETTINGS = {
  siteName: "TCFH News",
  // Açık kaynak varsayılanı: OpenAI. Panelden başka sağlayıcıya geçilebilir
  // (Gemini, Claude, DeepSeek, OpenRouter, Groq, Ollama…).
  llmProvider: process.env.LLM_PROVIDER ?? "openai",
  providerUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
  modelName: process.env.LLM_MODEL ?? "gpt-4o-mini",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
} as const;

/** Returns the single settings row, creating it with sane defaults if needed. */
export async function getSettings(): Promise<SystemSettings> {
  return prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ...DEFAULT_SETTINGS,
    },
  });
}

export type SafeSettings = {
  id: number;
  siteName: string;
  llmProvider: string;
  providerUrl: string;
  modelName: string;
  promptTemplate: string;
  hasApiKey: boolean;
  updatedAt: string;
};

/** Settings shape that is safe to send to the browser (API key is omitted). */
export function toSafeSettings(settings: SystemSettings): SafeSettings {
  return {
    id: settings.id,
    siteName: settings.siteName,
    llmProvider: settings.llmProvider,
    providerUrl: settings.providerUrl,
    modelName: settings.modelName,
    promptTemplate: settings.promptTemplate,
    hasApiKey: settings.apiKey.length > 0,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
