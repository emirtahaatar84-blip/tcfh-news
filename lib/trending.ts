import { prisma } from "@/lib/prisma";

/**
 * Lightweight trending-tag extraction. Scans recent headlines, counts
 * recurring significant words (proper-noun style keywords such as
 * "Nvidia", "Apple", "Süper Lig") and returns the most frequent ones.
 * These power the "İlginizi Çekebilir" widget and the sub-topic bubbles.
 */

export type TrendingTag = {
  tag: string;
  count: number;
};

const RECENT_ITEMS = 150;
const MIN_WORD_LENGTH = 4;
const MIN_COUNT = 2;
const MAX_TAGS = 20;

// Turkish + English stopwords and generic news vocabulary. These never
// qualify as trending tags.
const STOPWORDS = new Set([
  // Turkish
  "için", "ile", "gibi", "ancak", "çünkü", "daha", "çok", "olarak",
  "olduğu", "olduğunu", "olduğu", "sonra", "önce", "kadar", "yapılan",
  "yaptığı", "etti", "edilen", "olacak", "olmayan", "bulunan", "gelen",
  "veren", "alan", "değil", "yerine", "karşı", "göre", "hakkında",
  "birlikte", "ayrıca", "yani", "zaman", "bugün", "yarın", "dün",
  "haber", "haberi", "haberler", "son dakika", "dakika", "saat",
  "sürüyor", "başladı", "başlattı", "bitiyor", "açıkladı", "açıklandı",
  "söyledi", "dedi", "devam", "ediyor", "ederek", "gösteriyor",
  "sonuçları", "sonucu", "sebebiyle", "nedeniyle", "yüzünden",
  "tarafından", "kullanarak", "kullanıyor", "kullanıcı", "kullanıcılar",
  "öncesi", "sonrasında", "arasında", "üzerinde", "üzerine",
  "çalışma", "çalışıyor", "bekleniyor", "beklenen", "planlıyor",
  "planlanıyor", "hazırlanıyor", "getiriyor", "getirdi", "sunuyor",
  "girdi", "üretim", "üretimi", "yeni", "seri", "ilk", "dönem",
  "yıl", "yılında", "milyon", "milyar", "bin", "adet", "kez", "tane",
  "dongu", "olan", "ise", "ancak", "ancak", "gerek", "diye", "kendi",
  // English
  "with", "from", "that", "this", "will", "after", "before", "about",
  "into", "over", "says", "said", "have", "has", "been", "were",
  "which", "while", "would", "could", "should", "their", "there",
  "than", "then", "them", "they", "when", "what", "where", "also",
  "amid", "among", "both", "each", "more", "most", "other", "some",
  "such", "only", "very", "just", "like", "make", "made", "take",
  "took", "give", "given", "still", "since", "being", "under",
  "again", "further", "once", "here", "your", "yours", "news",
  "report", "reports", "update", "updates", "live", "latest",
  "first", "last", "next", "new", "year", "years", "month", "weeks",
  "week", "daily", "weekly", "announces", "announced", "launch",
  "launched", "release", "released", "unveils", "unveiled",
  "starts", "starting", "begins", "beginning", "using", "users",
  "production", "series", "part", "part of", "ahead",
]);

function tokenize(title: string): string[] {
  return title.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function extractTags(titles: string[]): TrendingTag[] {
  const counts = new Map<string, { display: string; count: number }>();

  for (const title of titles) {
    const seenInTitle = new Set<string>();

    for (const word of tokenize(title)) {
      if (word.length < MIN_WORD_LENGTH) continue;
      if (/^\d+$/.test(word)) continue;

      const lower = word.toLocaleLowerCase("tr-TR");
      if (STOPWORDS.has(lower)) continue;
      if (seenInTitle.has(lower)) continue;
      seenInTitle.add(lower);

      const existing = counts.get(lower);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(lower, { display: word, count: 1 });
      }
    }
  }

  return [...counts.values()]
    .filter((entry) => entry.count >= MIN_COUNT)
    .sort(
      (a, b) =>
        b.count - a.count || a.display.localeCompare(b.display, "tr"),
    )
    .slice(0, MAX_TAGS)
    .map((entry) => ({ tag: entry.display, count: entry.count }));
}

/** Top trending tags for the right sidebar widget. */
export async function getTrendingTags(limit = 6): Promise<TrendingTag[]> {
  const items = await prisma.newsItem.findMany({
    where: { removedAt: null },
    orderBy: { createdAt: "desc" },
    take: RECENT_ITEMS,
    select: { title: true },
  });

  return extractTags(items.map((item) => item.title)).slice(0, limit);
}

/** Secondary tag set for the horizontal sub-topic bubble bar. */
export async function getSubTopicTags(limit = 10): Promise<string[]> {
  const items = await prisma.newsItem.findMany({
    where: { removedAt: null },
    orderBy: { createdAt: "desc" },
    take: RECENT_ITEMS,
    select: { title: true },
  });

  return extractTags(items.map((item) => item.title))
    .slice(6, 6 + limit)
    .map((entry) => entry.tag);
}
