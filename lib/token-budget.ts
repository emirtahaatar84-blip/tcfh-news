import { prisma } from "@/lib/prisma";

/**
 * FAZ 5.4 — Token kullanım sayacı ve günlük bütçe.
 *
 * Amaç: LLM maliyetini görünür kılmak ve kontrolden çıkmasını engellemek.
 *
 * Kural:
 *   • Öğrenilen kullanım `TokenUsage` tablosuna günlük yazılır (model, giriş, çıkış).
 *   • Günlük limitin %80'ine gelince `warn` döner (çağıran loglar/uyarır).
 *   • %100'de `blocked` döner ve ÜRETİM DURUR (yeni sentez yapılmaz).
 *
 * Bütçe `LLM_DAILY_TOKEN_BUDGET` env'inden okunur; 0/boş = sınırsız.
 *
 * KVKK: yalnızca sayaç tutulur; istem/prompt İÇERİĞİ saklanmaz.
 */

const DEFAULT_WARN_RATIO = 0.8;

/** Europe/Istanbul günü (YYYY-MM-DD). */
export function usageDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function dailyBudget(): number {
  const value = Number(process.env.LLM_DAILY_TOKEN_BUDGET ?? "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export type BudgetState = "ok" | "warn" | "blocked" | "unlimited";

export type BudgetStatus = {
  state: BudgetState;
  used: number;
  budget: number;
  ratio: number;
};

/** Bugünkü toplam kullanım ve bütçe durumu. */
export async function getBudgetStatus(now: Date = new Date()): Promise<BudgetStatus> {
  const date = usageDate(now);
  const budget = dailyBudget();

  const rows = await prisma.tokenUsage.aggregate({
    where: { date },
    _sum: { promptTokens: true, completionTokens: true },
  });

  const used =
    (rows._sum.promptTokens ?? 0) + (rows._sum.completionTokens ?? 0);

  if (budget === 0) {
    return { state: "unlimited", used, budget: 0, ratio: 0 };
  }

  const ratio = used / budget;

  const state: BudgetState =
    ratio >= 1 ? "blocked" : ratio >= DEFAULT_WARN_RATIO ? "warn" : "ok";

  return { state, used, budget, ratio: Number(ratio.toFixed(3)) };
}

/**
 * Üretim yapılmadan ÖNCE çağrılır. `blocked` ise sentez atlanmalı.
 */
export async function canSpendTokens(): Promise<BudgetStatus> {
  return getBudgetStatus();
}

/** LLM yanıtındaki `usage` bilgisini kaydeder (hata yayını etkilemez). */
export async function recordTokenUsage(input: {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  kind?: "synthesis" | "review" | "audit" | "digest" | "chat" | "other";
}): Promise<void> {
  const promptTokens = Math.max(0, Math.round(input.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.round(input.completionTokens ?? 0));

  if (promptTokens === 0 && completionTokens === 0) return;

  try {
    await prisma.tokenUsage.create({
      data: {
        date: usageDate(),
        model: input.model.slice(0, 80) || "unknown",
        promptTokens,
        completionTokens,
        kind: input.kind ?? "other",
      },
    });
  } catch {
    // Sayaç yazılamazsa üretim durmaz.
  }
}

/**
 * OpenAI uyumlu yanıtlardan `usage` çıkarır.
 * Anthropic: input_tokens/output_tokens · Gemini: promptTokenCount/candidatesTokenCount
 */
export function extractUsage(payload: unknown): {
  promptTokens: number;
  completionTokens: number;
} {
  if (!payload || typeof payload !== "object") {
    return { promptTokens: 0, completionTokens: 0 };
  }

  const record = payload as Record<string, unknown>;
  const usage = (record.usage ?? record.usageMetadata ?? null) as Record<string, unknown> | null;

  if (!usage) return { promptTokens: 0, completionTokens: 0 };

  const pick = (...keys: string[]): number => {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  };

  return {
    promptTokens: pick("prompt_tokens", "input_tokens", "promptTokenCount"),
    completionTokens: pick("completion_tokens", "output_tokens", "candidatesTokenCount"),
  };
}

/** Günlük kullanım raporu (admin paneli). */
export async function usageReport(now: Date = new Date()) {
  const date = usageDate(now);

  const [byModel, total] = await Promise.all([
    prisma.tokenUsage.groupBy({
      by: ["model", "kind"],
      where: { date },
      _sum: { promptTokens: true, completionTokens: true },
    }),
    getBudgetStatus(now),
  ]);

  return {
    date,
    total,
    rows: byModel.map((row) => ({
      model: row.model,
      kind: row.kind,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
    })),
  };
}
