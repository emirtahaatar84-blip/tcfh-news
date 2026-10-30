import { PUS } from "./config";

/**
 * Portre Uygunluk Skoru (PUS, 0-100).
 * Girdi tamamen ölçülebilir alanlardan oluşur; LLM yok, aynı girdi → aynı skor.
 */

export type AffectedScope = "country" | "province" | "sector" | "company" | "individual";

export type PusInput = {
  /** Kaç kişi/kurumu etkiliyor. */
  affectedScope: AffectedScope;
  /** Konuyu kaç ayrı özne üzerinden anlatmak gerekiyor. */
  distinctSubjects: number;
  /** Doğrulanmış bağımsız kaynak sayısı (medya grubu tekilleştirilmiş). */
  independentSources: number;
  /** Haberin/kaynağın yayın zamanı. */
  publishedAt: Date;
  now?: Date;
  /** Son 7 günde aynı konuda portre var mı. */
  coveredRecently: boolean;
  /** Türkiye'yi doğrudan etkiliyor mu. */
  turkeyImpact: boolean;
};

export type PusDimension = {
  raw: number;
  weight: number;
  weighted: number;
  reason: string;
};

export type PusDecision = "auto" | "review" | "reject";

export type PusResult = {
  total: number;
  decision: PusDecision;
  originalityMode: "new" | "update";
  dimensions: Record<string, PusDimension>;
};

function band(input: number, bands: readonly { maxDays: number; score: number }[]): number {
  for (const item of bands) if (input <= item.maxDays) return item.score;
  return 0;
}

export function freshnessScore(publishedAt: Date, now: Date = new Date()): number {
  const days = Math.max(0, (now.getTime() - publishedAt.getTime()) / 86_400_000);
  return band(days, PUS.freshnessBands);
}

export function subjectFocusScore(distinctSubjects: number): number {
  for (const item of PUS.focusBands) {
    if (distinctSubjects <= item.maxSubjects) return item.score;
  }
  return 1;
}

export function computePus(input: PusInput): PusResult {
  const now = input.now ?? new Date();

  const publicInterest = PUS.publicInterestScale[input.affectedScope];
  const subjectFocus = subjectFocusScore(input.distinctSubjects);
  const sourceAvailability = Math.min(
    5,
    (input.independentSources / 3) * 5,
  );
  const freshness = freshnessScore(input.publishedAt, now);
  const originality = input.coveredRecently ? 0 : 5;
  const importance = input.turkeyImpact ? 5 : 1;

  const raw = {
    publicInterest,
    subjectFocus,
    sourceAvailability,
    freshness,
    originality,
    importance,
  };

  const labels: Record<keyof typeof raw, string> = {
    publicInterest: `etki alanı: ${input.affectedScope}`,
    subjectFocus: `özne sayısı: ${input.distinctSubjects}`,
    sourceAvailability: `bağımsız kaynak: ${input.independentSources}`,
    freshness: `yaş: ${Math.round((now.getTime() - input.publishedAt.getTime()) / 86_400_000)} gün`,
    originality: input.coveredRecently ? "son 7 günde işlendi" : "özgün konu",
    importance: input.turkeyImpact ? "Türkiye'yi doğrudan etkiliyor" : "dolaylı etki",
  };

  const dimensions: Record<string, PusDimension> = {};
  let total = 0;

  for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
    const weight = PUS.weights[key];
    const weighted = weight * (raw[key] / 5) * 100;
    total += weighted;
    dimensions[key] = {
      raw: raw[key],
      weight,
      weighted: Number(weighted.toFixed(2)),
      reason: labels[key],
    };
  }

  total = Number(total.toFixed(2));

  const decision: PusDecision =
    total >= PUS.thresholds.autoPublish
      ? "auto"
      : total >= PUS.thresholds.reviewMin
        ? "review"
        : "reject";

  return {
    total,
    decision,
    originalityMode: input.coveredRecently ? "update" : "new",
    dimensions,
  };
}
