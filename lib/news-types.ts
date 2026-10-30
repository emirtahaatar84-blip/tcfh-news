import type { NewsItem } from "@prisma/client";
import { parseJsonArray } from "@/lib/utils";

export type SourceMeta = {
  name: string;
  url: string | null;
  fetchedAt: string | null;
  /** Kaynağın olaya dair kendi başlığı (karşılaştırma için). */
  headline: string;
};

export type FeedNewsItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  detailedContent: string | null;
  category: string;
  sourcesCount: number;
  sources: string[];
  sourcesMeta: SourceMeta[];
  /** Otomatik sınıflandırma etiketleri: ["@teknoloji","@nvidia"]. */
  tags: string[];
  imageUrl: string | null;
  imageCredit: string | null;
  isVideo: boolean;
  youtubeId: string | null;
  viewCount: number;
  readingMinutes: number;
  createdAt: string;
};

export type FeedPage = {
  items: FeedNewsItem[];
  nextPage: number | null;
  hasMore: boolean;
};

/** Kaynak meta verisini güvenli biçimde ayrıştırır; yoksa adlardan üretir. */
export function parseSourcesMeta(
  metaJson: string | null | undefined,
  sourcesList: string,
): SourceMeta[] {
  const names = parseJsonArray(sourcesList);

  if (metaJson) {
    try {
      const parsed: unknown = JSON.parse(metaJson);

      if (Array.isArray(parsed)) {
        const items: SourceMeta[] = [];

        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;

          const record = entry as Record<string, unknown>;
          if (typeof record.name !== "string" || !record.name) continue;

          items.push({
            name: record.name,
            url: typeof record.url === "string" ? record.url : null,
            fetchedAt:
              typeof record.fetchedAt === "string" ? record.fetchedAt : null,
            headline:
              typeof record.headline === "string" ? record.headline : "",
          });
        }

        if (items.length > 0) return items;
      }
    } catch {
      // Bozuk JSON — adlara düş.
    }
  }

  return names.map((name) => ({
    name,
    url: null,
    fetchedAt: null,
    headline: "",
  }));
}

export function serializeNewsItem(item: NewsItem): FeedNewsItem {
  return {
    id: item.id,
    slug: item.slug ?? item.id,
    title: item.title,
    summary: item.summary,
    // Akış kartı gövdeyi kullanmaz; RSC/JSON yükünü küçük tut.
    detailedContent: null,
    category: item.category,
    sourcesCount: item.sourcesCount,
    sources: parseJsonArray(item.sourcesList),
    sourcesMeta: parseSourcesMeta(item.sourcesMeta, item.sourcesList),
    tags: parseJsonArray(item.tags),
    imageUrl: item.imageUrl ?? null,
    imageCredit: item.imageCredit ?? null,
    isVideo: item.isVideo,
    youtubeId: item.youtubeId ?? null,
    viewCount: item.viewCount,
    readingMinutes: item.readingMinutes,
    createdAt: item.createdAt.toISOString(),
  };
}
