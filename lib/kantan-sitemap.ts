import type { FeedStory } from "@/lib/kantan-feed";

/**
 * Sitemap tabanlı haber yedeği.
 *
 * Dış akışın (`/feed`) artık makale döndürmediği durumlarda (2026-10'dan
 * itibaren SPA kabuğu) son haberler Google News sitemap'inden okunur:
 *
 *   https://kantan.news/sitemap-news-tr.xml
 *
 * Yalnızca son N saatteki <news:publication_date> değeri olan URL'ler alınır.
 * Metin İNDİRİLMEZ (her makale için ayrı istek = 100+ gereksiz istek);
 * başlık URL'den türetilir, ayrıntı araştırma aşamasında çekilir.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 20_000;

export type SitemapResult = {
  ok: boolean;
  stories: FeedStory[];
  notes: string[];
  error?: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** URL slug'ını okunur bir başlığa çevirir (yalnız yedek; LLM başlığı yeniden yazar). */
export function titleFromSlug(url: string): string {
  const slug = url.replace(/\/+$/, "").split("/").pop() ?? "";
  return decodeEntities(
    slug
      .replace(/-/g, " ")
      .replace(/\b\p{Ll}/gu, (char) => char.toLocaleUpperCase("tr-TR")),
  ).slice(0, 200);
}

export async function fetchSitemapStories(
  sitemapUrl: string,
  options: { windowHours?: number; max?: number } = {},
): Promise<SitemapResult> {
  const windowHours = options.windowHours ?? 48;
  const max = options.max ?? 50;
  const notes: string[] = [];

  let xml: string;
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, stories: [], notes, error: `Sitemap HTTP ${response.status}` };
    }

    xml = await response.text();
  } catch (error) {
    return {
      ok: false,
      stories: [],
      notes,
      error: `Sitemap okunamadı: ${(error as Error).message.slice(0, 120)}`,
    };
  }

  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const stories: FeedStory[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = match[1];

    const loc = decodeEntities(block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? "");
    if (!loc || seen.has(loc)) continue;

    const publishedRaw =
      block.match(/<news:publication_date>([\s\S]*?)<\/news:publication_date>/)?.[1]?.trim() ??
      block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim();

    const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
    if (publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt.getTime() < cutoff) {
      continue;
    }

    const newsTitle = block.match(/<news:title>([\s\S]*?)<\/news:title>/)?.[1]?.trim();

    seen.add(loc);
    stories.push({
      key: loc,
      title: newsTitle ? decodeEntities(newsTitle) : titleFromSlug(loc),
      url: loc,
      originalUrl: loc,
      publishedAt,
      summary: "",
      category: "",
      tags: [],
      imageUrl: null,
      imageCredit: null,
      externalId: null,
    });

    if (stories.length >= max) break;
  }

  notes.push(`Sitemap yedeği: ${stories.length} hikâye (son ${windowHours} saat).`);

  return {
    ok: stories.length > 0,
    stories,
    notes,
    error: stories.length === 0 ? "Sitemap'te pencere içinde hikâye yok." : undefined,
  };
}
