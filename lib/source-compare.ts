import { prisma } from "@/lib/prisma";
import { parseSourcesMeta, type SourceMeta } from "@/lib/news-types";
import { parseJsonArray } from "@/lib/utils";
import { foldTurkish } from "@/lib/hq/normalize";

/**
 * FAZ 2 — Kaynak karşılaştırma.
 *
 * Bir haberin kaynaklarını yan yana göstermek için her kaynak hakkında
 * { ad, link, kısa özet } döndürür.
 *
 * NEDEN bu yöntem: haber üretilirken küme içindeki her kaynağın BAŞLIĞI
 * (`sourcesMeta.headline`) ve URL'si zaten saklanıyor. Özet için tam metin
 * yeniden indirilmez (yavaş + gereksiz yük); başlık + haber özetinden
 * KENDİ cümlelerimizle 1-2 cümle türetiriz.
 *
 * Telif: kaynak metni BİREBİR kopyalanmaz; yalnızca başlık (atıf olarak)
 * ve türetilmiş kısa özet gösterilir.
 */

export type ComparedSource = {
  name: string;
  url: string | null;
  /** Kaynağın kendi başlığı (birebir, atıf amaçlı). */
  headline: string;
  /** 1-2 cümlelik, kendi cümlelerimizle özet. */
  brief: string;
  /** Kaynağın vurgusu haber özetiyle örtüşüyor mu (0-1). */
  overlap: number;
};

export type SourceComparison = {
  newsId: string;
  title: string;
  sources: ComparedSource[];
  /** Kaç kaynak karşılaştırılabilir durumda. */
  comparable: number;
};

/** Kelime kümesi (ek soyma yok; hız için basit). */
function tokenSet(text: string): Set<string> {
  return new Set(
    foldTurkish(text)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / a.size;
}

/**
 * Kaynağın kendi başlığından 1-2 cümlelik tarafsız özet üretir.
 * Başlık zaten kısa olduğu için cümle bölme gerekmez; gerektiğinde
 * "—" / "|" ile ayrılmış bölümler temizlenir.
 */
function briefFromHeadline(headline: string, newsSummary: string): string {
  const cleaned = headline
    .replace(/\s*[|–—-]\s*[^|–—-]{0,40}$/, "") // "... | Site adı" ekini at
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return newsSummary.slice(0, 200);

  // Başlık çok kısaysa haber özetinin ilk cümlesiyle zenginleştir.
  if (cleaned.length < 40) {
    const firstSentence = newsSummary.split(/(?<=[.!?])\s+/)[0] ?? "";
    return `${cleaned}. ${firstSentence}`.slice(0, 260);
  }

  return cleaned.slice(0, 260);
}

/** Haberin kaynaklarını karşılaştırılabilir biçimde döndürür. */
export async function getSourceComparison(newsId: string): Promise<SourceComparison | null> {
  const row = await prisma.newsItem.findFirst({
    where: { id: newsId, removedAt: null },
    select: {
      id: true,
      title: true,
      summary: true,
      sourcesMeta: true,
      sourcesList: true,
    },
  });

  if (!row) return null;

  const metas: SourceMeta[] = parseSourcesMeta(row.sourcesMeta, row.sourcesList);
  const summaryTokens = tokenSet(row.summary);

  const sources: ComparedSource[] = metas.map((meta) => {
    const headlineTokens = tokenSet(meta.headline);

    return {
      name: meta.name,
      url: meta.url,
      headline: meta.headline,
      brief: briefFromHeadline(meta.headline, row.summary),
      overlap: Number(overlapScore(headlineTokens, summaryTokens).toFixed(2)),
    };
  });

  // Örtüşmesi yüksek olan önce (en temsili kaynak).
  sources.sort((a, b) => b.overlap - a.overlap);

  return {
    newsId: row.id,
    title: row.title,
    sources,
    comparable: sources.filter((source) => Boolean(source.url)).length,
  };
}

/** Etiket listesi: her etiket ve kaç haberde geçtiği. */
export async function listTags(limit = 60): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.newsItem.findMany({
    where: { removedAt: null, tags: { not: "[]" } },
    select: { tags: true },
    take: 3000,
    orderBy: { createdAt: "desc" },
  });

  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const tag of parseJsonArray(row.tags)) {
      if (!tag.startsWith("@")) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "tr"))
    .slice(0, limit);
}

/** Etikete göre haber listesi (sayfalı). */
export async function newsByTag(
  tag: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ items: Awaited<ReturnType<typeof prisma.newsItem.findMany>>; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const normalized = tag.startsWith("@") ? tag : `@${tag}`;

  const where = {
    removedAt: null,
    // JSON dizi içinde etiket araması: "","@x","" deseni ile yanlış
    // eşleşmeyi (ör. "@spor" içinde "@sporx") önler.
    tags: { contains: `"${normalized}"` },
  } as const;

  const [items, total] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.newsItem.count({ where }),
  ]);

  return { items, total };
}
