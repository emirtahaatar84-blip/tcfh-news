/**
 * Münazara Uygunluk Skoru (MUS) — TEK AYAR NOKTASI.
 *
 * Tüm ağırlıklar, eşikler ve günlük limitler burada tutulur; algoritma
 * (`lib/debate/score.ts`) yalnızca bu değerleri okur. Değiştirmek için
 * başka dosyaya dokunmak gerekmez.
 *
 * Hesaplama tamamen sunucu tarafında (build/render/cron) yapılır. Tarayıcı
 * hiçbir zaman üçüncü tarafa istek atmaz.
 */

export const MUS_WEIGHTS = {
  /** İki tarafın da savunulabilir olması */
  controversy: 0.3,
  /** En az 3 bağımsız kaynak bulunabilmesi */
  evidence: 0.2,
  /** Güncellik (0-7 gün en yüksek) */
  recency: 0.2,
  /** Türkiye'yi doğrudan etkileme */
  scope: 0.15,
  /** Seviyeye uygunluk */
  levelFit: 0.1,
  /** Son 30 günde aynı motion üretilmemiş olması */
  originality: 0.05,
} as const;

/** Seviye filtresi aktifken bu bileşenin ağırlığı (diğerleri orantılı küçülür). */
export const MUS_LEVEL_FILTER_WEIGHT = 0.2;

export const MUS_THRESHOLDS = {
  /** >= 65 → otomatik taslak */
  autoDraft: 65,
  /** 50-64 → inceleme kuyruğu */
  reviewQueue: 50,
  /** Tek taraflı konular elenir */
  minControversy: 2,
} as const;

/** Günlük üretim limitleri + çeşitlilik kuralı. */
export const MUS_DAILY_LIMIT = {
  total: 3,
  lise: 2,
  universite: 1,
  /** Aynı kategoriden üst üste en fazla bu kadar. */
  maxPerCategory: 2,
} as const;

/** Akış sıralaması: MUS %60, güncellik %30, editör sabitlemesi %10. */
export const MUS_RANK_WEIGHTS = {
  mus: 0.6,
  recency: 0.3,
  editorPin: 0.1,
} as const;

/** Güncellik bileşeni: gün aralığı → 0-5 puan. */
export const RECENCY_BANDS = [
  { maxDays: 7, score: 5 },
  { maxDays: 30, score: 3 },
  { maxDays: 90, score: 1 },
  { maxDays: Infinity, score: 0 },
] as const;

/** Kapsam bileşeni: Türkiye etkisi → 0-5 puan. */
export const SCOPE_SCORES = {
  /** Türkiye'yi doğrudan etkiliyor */
  direct: 5,
  /** Türkiye bağlantısı var */
  link: 3,
  /** Yalnızca küresel */
  global: 2,
} as const;

/** Özgünlük bileşeni → 0-5 puan. */
export const ORIGINALITY_SCORES = {
  none: 5,
  similar: 2,
  duplicate: 0,
} as const;

/**
 * Kalite kapıları — herhangi biri geçilmezse içerik YAYINA GİTMEZ.
 * (11.6)
 */
export const MUS_GATES = {
  minIndependentSources: 3,
  minArgumentsPerSide: 3,
  minKeyClashes: 3,
  motionMustMatch: /^Bu meclis\b.+\binanır[.!]?$/i,
} as const;

export type DebateLevel = "lise" | "universite" | "karma";

/** Akış/arşiv seviye filtresi (karma ayrı bir filtre değildir). */
export type DebateLevelFilter = "tumu" | "lise" | "universite";

export const DEBATE_LEVELS: readonly DebateLevel[] = [
  "lise",
  "universite",
  "karma",
] as const;

export function isDebateLevel(value: unknown): value is DebateLevel {
  return (
    typeof value === "string" &&
    (DEBATE_LEVELS as readonly string[]).includes(value)
  );
}

/** Seviye etiketi (TR). */
export const DEBATE_LEVEL_LABELS: Record<DebateLevel, string> = {
  lise: "Lise",
  universite: "Üniversite",
  karma: "Karma",
};

/**
 * Seviye filtresi aktifken ağırlıkları yeniden normalize eder.
 * `levelFit` 0.20'ye çıkar; kalan 0.80 diğer bileşenler arasında orantılı
 * dağıtılır. Toplam her zaman 1.00'dır.
 */
export function weightsForLevelFilter(
  active: boolean,
): Record<keyof typeof MUS_WEIGHTS, number> {
  if (!active) return { ...MUS_WEIGHTS };

  const remaining = 1 - MUS_LEVEL_FILTER_WEIGHT;
  const others = Object.entries(MUS_WEIGHTS).filter(
    ([key]) => key !== "levelFit",
  ) as [keyof typeof MUS_WEIGHTS, number][];
  const otherTotal = others.reduce((sum, [, weight]) => sum + weight, 0);

  const result = {} as Record<keyof typeof MUS_WEIGHTS, number>;
  for (const [key, weight] of others) {
    result[key] = (weight / otherTotal) * remaining;
  }
  result.levelFit = MUS_LEVEL_FILTER_WEIGHT;

  return result;
}

/** Doğrulanmış / başarısız RSS kaynakları (script çıktısıyla eşlenir). */
export const DEBATE_FEED_CANDIDATES = [
  { name: "The Conversation", url: "https://theconversation.com/global/articles.atom" },
  { name: "Brookings", url: "https://www.brookings.edu/feed/" },
  { name: "DW English", url: "https://rss.dw.com/rdf/rss-en-all" },
  { name: "Debating Matters", url: "https://www.debatingmatters.com/feed/" },
  { name: "Intelligence Squared", url: "https://www.intelligencesquared.com/feed/" },
  { name: "Carnegie Council", url: "https://www.carnegiecouncil.org/rss/articles" },
  { name: "Pew Research", url: "https://www.pewresearch.org/feed/" },
  { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  { name: "Anadolu Ajansı", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel" },
  { name: "TÜBİTAK", url: "https://www.tubitak.gov.tr/tr/rss" },
] as const;
