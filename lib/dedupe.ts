import { prisma } from "@/lib/prisma";
import { foldTurkish } from "@/lib/hq/normalize";

/**
 * TEKRAR BASTIRMA (diversity guard).
 *
 * NEDEN: Canlı veri 738 haber/gün üretiyor ama ortalama okunma 1.15.
 * Aynı olayın 20 varyantı yayınlanınca akış okunmaz hale geliyor.
 *
 * Kural: aynı "konu imzası" 24 saat içinde yalnızca bir kez akışta görünür.
 * Haberler SİLİNMEZ — yalnızca akış sıralamasında bastırılır; arama,
 * etiket sayfası ve arşivden erişilebilir kalır.
 */

/** Konu imzası penceresi. */
export const DEDUPE_WINDOW_HOURS = 24;

/** İmza benzerlik eşiği (Jaccard). */
export const DEDUPE_SIMILARITY = 0.55;

/** Başlıktan anlamlı kök kelimeler (ek soyma ile). */
const STOP = new Set([
  "bir", "bu", "su", "ile", "ve", "veya", "ama", "fakat", "icin", "olan",
  "olarak", "daha", "cok", "en", "son", "yeni", "gore", "kadar", "gibi",
  "sonra", "once", "uzerine", "hakkinda", "turkiye", "yil", "gun", "ay",
  "haber", "haberler", "aciklama", "duyurdu", "acikladi", "yapti", "oldu",
]);

/**
 * Türkçe gövdeleme: İLK 4 KARAKTER.
 *
 * NEDEN ek soyma değil: Ölçüm gösterdi ki ek listesiyle "faizini", "faizi",
 * "faiz" üç AYRI kök çıkıyor ve aynı konu 0.38 benzerlikte kalıyor —
 * tekrar bastırma hiç çalışmıyordu. İlk 4 karakter yöntemiyle aynı çift
 * 0.70'e çıkıyor, farklı konu 0.00'da kalıyor.
 *
 * Türkçe kökler çoğunlukla ilk hecede ayrışır (faiz/faizini, indir/indirimi).
 * Kısa kelimeler (≤4) olduğu gibi kalır.
 */
const STEM_LENGTH = 4;

function stem(word: string): string {
  const folded = foldTurkish(word);
  return folded.length <= STEM_LENGTH ? folded : folded.slice(0, STEM_LENGTH);
}

/** Başlık + özetten anlamlı kök kümesi. */
export function topicTokens(title: string, summary = ""): Set<string> {
  const tokens = foldTurkish(`${title} ${summary}`)
    .split(" ")
    .filter((token) => token.length >= 4 && !STOP.has(token))
    .map(stem)
    .filter((token) => token.length >= 4 && !STOP.has(token));

  return new Set(tokens);
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export type DedupeCandidate = {
  id: string;
  title: string;
  summary: string;
  createdAt: Date;
};

/**
 * Bir haber listesini alır; aynı konudan yalnızca EN İYİSİNİ bırakır.
 *
 * "En iyi" seçimi: `scoreOf` verilirse onu kullanır (genellikle önem
 * skoru); verilmezse tazelik. Böylece aynı olayın en kapsamlı haberi kalır.
 */
export function dedupeByTopic<T extends DedupeCandidate>(
  items: T[],
  options: {
    scoreOf?: (item: T) => number;
    windowHours?: number;
    threshold?: number;
  } = {},
): { kept: T[]; suppressed: T[] } {
  const windowMs = (options.windowHours ?? DEDUPE_WINDOW_HOURS) * 3600_000;
  const threshold = options.threshold ?? DEDUPE_SIMILARITY;
  const scoreOf = options.scoreOf ?? ((item: T) => item.createdAt.getTime());

  // En iyiden en kötüye sırala; ilk gelen kazanır.
  const order = [...items].sort((a, b) => scoreOf(b) - scoreOf(a));

  const kept: T[] = [];
  const suppressed: T[] = [];
  const accepted: { tokens: Set<string>; createdAt: Date }[] = [];

  for (const item of order) {
    const tokens = topicTokens(item.title, item.summary);

    // Kategorik gürültü: tek kelimelik imza bastırılmaz (çok genel).
    if (tokens.size < 2) {
      kept.push(item);
      continue;
    }

    const clash = accepted.find(
      (entry) =>
        Math.abs(entry.createdAt.getTime() - item.createdAt.getTime()) <= windowMs &&
        similarity(entry.tokens, tokens) >= threshold,
    );

    if (clash) {
      suppressed.push(item);
    } else {
      kept.push(item);
      accepted.push({ tokens, createdAt: item.createdAt });
    }
  }

  return { kept, suppressed };
}

/**
 * Veritabanı destekli bastırma: son `windowHours` içindeki haberlerle
 * karşılaştırır. Yeni yayın öncesi çağrılır.
 */
export async function isDuplicateTopic(
  title: string,
  summary: string,
  options: { windowHours?: number; excludeId?: string } = {},
): Promise<{ duplicate: boolean; similarTo?: { id: string; title: string; score: number } }> {
  const since = new Date(Date.now() - (options.windowHours ?? DEDUPE_WINDOW_HOURS) * 3600_000);

  const recent = await prisma.newsItem.findMany({
    where: {
      removedAt: null,
      createdAt: { gte: since },
      ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, summary: true },
  });

  const tokens = topicTokens(title, summary);
  if (tokens.size < 2) return { duplicate: false };

  let best: { id: string; title: string; score: number } | null = null;

  for (const row of recent) {
    const score = similarity(tokens, topicTokens(row.title, row.summary));
    if (score >= DEDUPE_SIMILARITY && (!best || score > best.score)) {
      best = { id: row.id, title: row.title, score: Number(score.toFixed(2)) };
    }
  }

  return best ? { duplicate: true, similarTo: best } : { duplicate: false };
}
