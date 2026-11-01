import { foldTurkish } from "@/lib/hq/normalize";

/**
 * HABER ÖNEM SKORU (HÖS) — 0-100.
 *
 * NEDEN: Canlı veri 4608 haber, %89'u tek kaynak, ortalama okunma 1.15.
 * Sistem her şeyi yayınlıyor; okuyucu neyin önemli olduğunu bulamıyor.
 * Bu skor, akışı "gerekli haberler" önce gelecek biçimde sıralar.
 *
 * Tasarım ilkesi: skor YALNIZCA elimizdeki kanıtlanabilir veriden üretilir
 * (kaynak sayısı, kategori, varlık, tazelik, doğrulama durumu). LLM yok —
 * aynı girdi her zaman aynı skoru verir, gerekçe denetlenebilir.
 *
 * Ağırlıklar `IMPORTANCE_WEIGHTS` içinde; değiştirmek için tek yer.
 */

export const IMPORTANCE_WEIGHTS = {
  /** Kaç bağımsız kaynak doğruluyor — en güçlü sinyal. */
  verification: 0.35,
  /** Kategori kamu yararı ağırlığı. */
  category: 0.2,
  /** Türkiye'yi doğrudan etkiliyor mu (varlık + yer). */
  relevance: 0.2,
  /** Tazelik — 6 saat içi tam puan. */
  freshness: 0.15,
  /** Kalite denetimi + doğrulama kapısından geçmiş mi. */
  quality: 0.1,
} as const;

/** Kategori kamu yararı (0-1). Sağlık/Gündem en yüksek, magazin spor en düşük. */
export const CATEGORY_IMPORTANCE: Record<string, number> = {
  Sağlık: 1.0,
  Gündem: 0.95,
  Ekonomi: 0.9,
  Siyaset: 0.85,
  Dünya: 0.8,
  Bilim: 0.75,
  "Yapay Zekâ": 0.7,
  Teknoloji: 0.65,
  Kültür: 0.5,
  Spor: 0.45,
  Diğer: 0.35,
};

/** Türkiye'yi doğrudan etkileyen kurum/aktör/konu işaretleri. */
const TURKEY_SIGNALS = [
  "türkiye", "turkiye", "tbmm", "cumhurbaşkan", "cumhurbaskan", "bakan",
  "bakanlık", "bakanlik", "merkez bankası", "merkez bankasi", "tcmb",
  "enflasyon", "asgari ücret", "asgari ucret", "emekli", "vergi",
  "meb", "yök", "yok", "üniversite", "universite", "hastane", "deprem",
  "afad", "valilik", "belediye", "seçim", "secim", "meclis", "anayasa",
  "savunma", "tsk", "aselsan", "baykar", "tusaş", "tusas", "ssb",
  "ihracat", "ithalat", "borsa istanbul", "lira", "tl", "dolar",
];

export type ImportanceInput = {
  title: string;
  summary: string;
  category: string;
  /** Ham kayıt sayısı. */
  sourcesCount: number;
  /** Medya grubu tekilleştirilmiş bağımsız kaynak sayısı. */
  verifiedSourceCount: number;
  createdAt: Date;
  /** Kalite denetimi puanı (0-10), yoksa null. */
  qualityScore?: number | null;
  /** Doğrulama kapısı durumu ("ok" | "review" | null). */
  factCheckStatus?: string | null;
  now?: Date;
};

export type ImportanceBreakdown = {
  verification: number;
  category: number;
  relevance: number;
  freshness: number;
  quality: number;
};

export type ImportanceResult = {
  /** 0-100, iki ondalık. */
  score: number;
  breakdown: ImportanceBreakdown;
  /** Her boyutun kısa gerekçesi (denetim için). */
  reasons: string[];
  /** Skorun "öne çıkan" sayılması için eşik. */
  isTopStory: boolean;
  /** Sıralamada öne çıkarılsın mı (akış filtresi). */
  isWorthShowing: boolean;
};

export const IMPORTANCE_THRESHOLDS = {
  /** Bu puanın üstü "öne çıkanlar" bölümüne girer. */
  topStory: 65,
  /** Bu puanın altı akışta en sona düşer. */
  lowValue: 30,
} as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Doğrulama: 1 kaynak = 0.15, 2 = 0.55, 3 = 0.8, 5+ = 1.0 */
export function verificationScore(verified: number): number {
  if (verified <= 0) return 0;
  if (verified === 1) return 0.15;
  if (verified === 2) return 0.55;
  if (verified === 3) return 0.8;
  if (verified === 4) return 0.92;
  return 1;
}

/** Tazelik: 0-6 saat = 1.0, 6-24 saat arası doğrusal, 24-72 saat 0.3, sonrası 0.1 */
export function freshnessScore(createdAt: Date, now: Date = new Date()): number {
  const hours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  if (hours <= 6) return 1;
  if (hours <= 24) return 1 - ((hours - 6) / 18) * 0.5; // 1 → 0.5
  if (hours <= 72) return 0.5 - ((hours - 24) / 48) * 0.2; // 0.5 → 0.3
  return 0.1;
}

/** Türkiye ilgisi: başlık + özetteki sinyal yoğunluğu. */
export function relevanceScore(title: string, summary: string): number {
  const folded = foldTurkish(`${title} ${summary}`);
  let hits = 0;

  for (const signal of TURKEY_SIGNALS) {
    if (folded.includes(foldTurkish(signal))) hits += 1;
  }

  if (hits === 0) return 0.15;
  if (hits === 1) return 0.55;
  if (hits === 2) return 0.8;
  return 1;
}

/** Kalite: denetim puanı + doğrulama kapısı. */
export function qualityScore(
  quality: number | null | undefined,
  factCheckStatus: string | null | undefined,
): number {
  let score = 0.5; // denetlenmemiş = nötr

  if (typeof quality === "number") {
    score = clamp01(quality / 10);
  }

  // Doğrulama kapısından geçmiş haber güvenilir.
  if (factCheckStatus === "ok") score = Math.min(1, score + 0.25);
  else if (factCheckStatus === "review") score = Math.max(0, score - 0.4);

  return score;
}

/**
 * Ana hesaplayıcı. Saf fonksiyon — aynı girdi her zaman aynı skoru verir.
 */
export function computeImportance(input: ImportanceInput): ImportanceResult {
  const now = input.now ?? new Date();

  const verification = verificationScore(
    Math.max(input.verifiedSourceCount, 0),
  );
  const category = CATEGORY_IMPORTANCE[input.category] ?? 0.35;
  const relevance = relevanceScore(input.title, input.summary);
  const freshness = freshnessScore(input.createdAt, now);
  const quality = qualityScore(input.qualityScore, input.factCheckStatus);

  const breakdown: ImportanceBreakdown = {
    verification,
    category,
    relevance,
    freshness,
    quality,
  };

  const w = IMPORTANCE_WEIGHTS;
  const raw =
    w.verification * verification +
    w.category * category +
    w.relevance * relevance +
    w.freshness * freshness +
    w.quality * quality;

  const score = Number((raw * 100).toFixed(2));

  const reasons: string[] = [
    `doğrulama ${input.verifiedSourceCount} kaynak → ${(verification * 100).toFixed(0)}`,
    `kategori ${input.category} → ${(category * 100).toFixed(0)}`,
    `Türkiye ilgisi → ${(relevance * 100).toFixed(0)}`,
    `tazelik → ${(freshness * 100).toFixed(0)}`,
    `kalite → ${(quality * 100).toFixed(0)}`,
  ];

  return {
    score,
    breakdown,
    reasons,
    isTopStory: score >= IMPORTANCE_THRESHOLDS.topStory,
    isWorthShowing: score >= IMPORTANCE_THRESHOLDS.lowValue,
  };
}

/**
 * Akış için tek geçişli sıralama.
 *
 * Kural: önem skoru yüksek olan öne çıkar; eşitlikte tazelik.
 * "Düşük değerli" (skor < lowValue) haberler listenin SONUNA düşer —
 * silinmez, arşiv/arama ile erişilebilir kalır.
 */
export function rankByImportance<T extends ImportanceInput>(items: T[]): (T & { importance: ImportanceResult })[] {
  const now = new Date();

  return items
    .map((item) => ({ ...item, importance: computeImportance({ ...item, now }) }))
    .sort((a, b) => {
      const aLow = a.importance.score < IMPORTANCE_THRESHOLDS.lowValue ? 1 : 0;
      const bLow = b.importance.score < IMPORTANCE_THRESHOLDS.lowValue ? 1 : 0;
      if (aLow !== bLow) return aLow - bLow;

      if (b.importance.score !== a.importance.score) {
        return b.importance.score - a.importance.score;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}
