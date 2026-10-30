/**
 * Münazara Uygunluk Skoru (MUS) ve kalite kapıları — saf fonksiyonlar.
 *
 * Hiçbir ağ isteği, veritabanı erişimi veya tarayıcı bağımlılığı yoktur;
 * bu yüzden testlerde ve build/cron adımlarında aynen kullanılır.
 */

import {
  MUS_DAILY_LIMIT,
  MUS_GATES,
  MUS_RANK_WEIGHTS,
  MUS_THRESHOLDS,
  MUS_WEIGHTS,
  ORIGINALITY_SCORES,
  RECENCY_BANDS,
  SCOPE_SCORES,
  weightsForLevelFilter,
  type DebateLevel,
} from "@/lib/debate/config";

export type MusInput = {
  /** 0-5: iki tarafın da savunulabilirliği */
  controversy: number;
  /** 0-5: en az 3 bağımsız kaynak bulunabilirliği */
  infoNeed: number;
  /** Kaynağın yaşı (gün) */
  recencyDays: number;
  /** tr | global */
  scope: "tr" | "global";
  /** Küresel konunun Türkiye bağlantısı var mı? */
  hasTurkeyLink?: boolean;
  /** 0-5: seviyeye uygunluk (lise: somutluk, üniversite: kuramsal derinlik) */
  levelFit: number;
  /** Son 30 gün: aynı motion → duplicate, benzer konu → similar */
  originality: "none" | "similar" | "duplicate";
  /** Seviye filtresi aktif mi? (levelFit ağırlığı 0.20'ye çıkar) */
  levelFilter?: boolean;
};

export type MusComponents = {
  controversy: number;
  evidence: number;
  recency: number;
  scope: number;
  levelFit: number;
  originality: number;
};

export type MusWeighted = MusComponents;

export type MusResult = {
  /** 0-100, tam sayı */
  score: number;
  components: MusComponents;
  weighted: MusWeighted;
  weights: Record<keyof MusComponents, number>;
  eliminated: boolean;
  decision: "auto" | "review" | "reject";
  recencyScore: number;
  scopeScore: number;
  reason: string;
};

function clamp05(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, value));
}

export function recencyScoreFor(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0;
  for (const band of RECENCY_BANDS) {
    if (days <= band.maxDays) return band.score;
  }
  return 0;
}

export function scopeScoreFor(
  scope: "tr" | "global",
  hasTurkeyLink = false,
): number {
  if (scope === "tr") return SCOPE_SCORES.direct;
  return hasTurkeyLink ? SCOPE_SCORES.link : SCOPE_SCORES.global;
}

function pct(score05: number): number {
  return (clamp05(score05) / 5) * 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * MUS = 0.30*Tartışılabilirlik + 0.20*Kanıt + 0.20*Güncellik +
 *       0.15*Kapsam + 0.10*Seviye + 0.05*Özgünlük
 */
export function computeMus(input: MusInput): MusResult {
  const weights = weightsForLevelFilter(Boolean(input.levelFilter));

  const recencyScore = recencyScoreFor(input.recencyDays);
  const scopeScore = scopeScoreFor(input.scope, input.hasTurkeyLink);

  const components: MusComponents = {
    controversy: pct(input.controversy),
    evidence: pct(input.infoNeed),
    recency: pct(recencyScore),
    scope: pct(scopeScore),
    levelFit: pct(input.levelFit),
    originality: pct(ORIGINALITY_SCORES[input.originality]),
  };

  const weighted = {} as MusWeighted;
  let total = 0;

  for (const key of Object.keys(components) as (keyof MusComponents)[]) {
    const value = components[key] * weights[key];
    weighted[key] = round1(value);
    total += value;
  }

  const score = Math.round(total);
  const eliminated = clamp05(input.controversy) < MUS_THRESHOLDS.minControversy;
  const decision: MusResult["decision"] = eliminated
    ? "reject"
    : score >= MUS_THRESHOLDS.autoDraft
      ? "auto"
      : score >= MUS_THRESHOLDS.reviewQueue
        ? "review"
        : "reject";

  const reasonParts = [
    `Tartışılabilirlik ${clamp05(input.controversy)}/5`,
    `${clamp05(input.infoNeed)}/5 kanıt bulunabilirliği`,
    `${Math.max(0, Math.round(input.recencyDays))} günlük`,
    input.scope === "tr"
      ? "Türkiye'yi doğrudan etkiliyor"
      : input.hasTurkeyLink
        ? "Türkiye bağlantısı var"
        : "yalnızca küresel kapsam",
    `seviye uyumu ${clamp05(input.levelFit)}/5`,
    input.originality === "none"
      ? "son 30 günde benzeri yok"
      : input.originality === "similar"
        ? "benzer konu var"
        : "aynı motion son 30 günde üretilmiş",
  ];

  const decisionLabel =
    eliminated
      ? "tek taraflı olduğu için elendi"
      : decision === "auto"
        ? "otomatik taslak"
        : decision === "review"
          ? "inceleme kuyruğu"
          : "eşiğin altında, elendi";

  return {
    score,
    components,
    weighted,
    weights,
    eliminated,
    decision,
    recencyScore,
    scopeScore,
    reason: `${reasonParts.join(", ")} → ${score} (${decisionLabel}).`,
  };
}

export type DebateQualityInput = {
  motionText: string;
  independentSourceCount: number;
  governmentArguments: number;
  oppositionArguments: number;
  keyClashCount: number;
  hasSpecialCategoryData?: boolean;
  hasMinorName?: boolean;
  hasUnverifiedAccusationInTitle?: boolean;
};

export type GateResult = {
  passed: boolean;
  failures: string[];
};

/** Kalite kapıları (11.6). Herhangi biri geçilmezse yayına girmez. */
export function checkDebateGates(input: DebateQualityInput): GateResult {
  const failures: string[] = [];

  if (input.independentSourceCount < MUS_GATES.minIndependentSources) {
    failures.push(
      `En az ${MUS_GATES.minIndependentSources} bağımsız kaynak gerekir`,
    );
  }
  if (!MUS_GATES.motionMustMatch.test(input.motionText.trim())) {
    failures.push('Motion "Bu meclis ... inanır" biçiminde değil');
  }
  if (input.governmentArguments < MUS_GATES.minArgumentsPerSide) {
    failures.push("Hükümet için en az 3 argüman gerekir");
  }
  if (input.oppositionArguments < MUS_GATES.minArgumentsPerSide) {
    failures.push("Muhalefet için en az 3 argüman gerekir");
  }
  if (input.keyClashCount < MUS_GATES.minKeyClashes) {
    failures.push(`En az ${MUS_GATES.minKeyClashes} kilit çatışma gerekir`);
  }
  if (input.hasSpecialCategoryData) {
    failures.push("Özel nitelikli kişisel veri içeremez");
  }
  if (input.hasMinorName) {
    failures.push("Reşit olmayan kişi adı içeremez");
  }
  if (input.hasUnverifiedAccusationInTitle) {
    failures.push("Doğrulanmamış suçlama başlıkta olamaz");
  }

  return { passed: failures.length === 0, failures };
}

export type RankableDebate = {
  musScore: number;
  recencyDays: number;
  editorPin: number;
  publishedAt: string | Date;
};

/**
 * Akış sıralaması: MUS*0.6 + Güncellik*0.3 + EditörSabitlemesi*0.1.
 * Güncellik ve sabitleme 0-100 ölçeğine normalize edilir (aksi hâlde
 * 0-5 ölçekli değerler MUS'u ezerdi). Eşitlikte daha yeni olan öne geçer.
 */
export function rankScore(input: RankableDebate): number {
  const recency = (recencyScoreFor(input.recencyDays) / 5) * 100;
  const pin = (Math.min(5, Math.max(0, input.editorPin)) / 5) * 100;

  return (
    input.musScore * MUS_RANK_WEIGHTS.mus +
    recency * MUS_RANK_WEIGHTS.recency +
    pin * MUS_RANK_WEIGHTS.editorPin
  );
}

export function sortDebatesForFeed<T extends RankableDebate>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const diff = rankScore(b) - rankScore(a);
    if (Math.abs(diff) > 0.0001) return diff;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export type DailyCandidate = RankableDebate & {
  id: string;
  level: DebateLevel;
  category: string;
  decision: MusResult["decision"];
};

/**
 * Günlük üretim seçimi: toplam 3 (lise 2 + üniversite 1),
 * aynı kategoriden en fazla 2. Kararlılık için MUS sırası korunur.
 */
export function selectDailyBatch<T extends DailyCandidate>(
  candidates: T[],
): T[] {
  const eligible = sortDebatesForFeed(
    candidates.filter((candidate) => candidate.decision !== "reject"),
  );

  const selected: T[] = [];
  const perLevel = { lise: 0, universite: 0 };
  const perCategory = new Map<string, number>();

  for (const candidate of eligible) {
    if (selected.length >= MUS_DAILY_LIMIT.total) break;

    if (candidate.level === "lise") {
      if (perLevel.lise >= MUS_DAILY_LIMIT.lise) continue;
    } else if (candidate.level === "universite") {
      if (perLevel.universite >= MUS_DAILY_LIMIT.universite) continue;
    }

    const used = perCategory.get(candidate.category) ?? 0;
    if (used >= MUS_DAILY_LIMIT.maxPerCategory) continue;

    selected.push(candidate);
    perCategory.set(candidate.category, used + 1);
    if (candidate.level === "lise") perLevel.lise += 1;
    if (candidate.level === "universite") perLevel.universite += 1;
  }

  return selected;
}

/** Denetlenebilir tek satırlık MUS raporu. */
export function musReportLine(input: {
  title: string;
  result: MusResult;
}): string {
  const { components, weights, score, decision } = input.result;
  const parts = (
    Object.keys(components) as (keyof MusComponents)[]
  ).map(
    (key) =>
      `${key}=${components[key].toFixed(1)}×${weights[key].toFixed(2)}`,
  );

  return `${input.title} → ${parts.join(" + ")} = ${score} [${decision}]`;
}

export { MUS_WEIGHTS };
