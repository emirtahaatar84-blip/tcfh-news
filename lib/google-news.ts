import type { FeedItemLite } from "@/lib/research";

/**
 * Google Haberler RSS — GEÇMİŞE YÖNELİK ARAŞTIRMA.
 *
 * Kamuya açık RSS havuzu yalnızca son dakika akışını taşır; dava geçmişi,
 * özgeçmiş ve eski gelişmeler orada bulunmaz. Google Haberler'in RSS araması
 * arşive de uzanır ve farklı alan adlarından sonuç getirir.
 *
 * KVKK/NOT: Bu istek SUNUCU tarafında yapılır; kullanıcı tarayıcısından
 * üçüncü tarafa hiçbir istek gitmez. Kullanıcı verisi gönderilmez.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TIMEOUT_MS = 15_000;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Google Haberler bağlantısı `news.google.com/rss/articles/...` biçiminde bir
 * yönlendirmedir. Gerçek yayıncı `<source url="https://www.ntv.com.tr">`
 * özniteliğindedir; rss-parser bunu ham XML'den okumak gerekir.
 */
function extractSourceDomain(itemXml: string): string {
  const match = itemXml.match(/<source[^>]*url="([^"]+)"/i);
  if (match) return domainOf(match[1].replace(/&amp;/g, "&"));
  return "";
}

export type GoogleNewsResult = {
  items: FeedItemLite[];
  notes: string[];
};

/**
 * Google Haberler RSS araması. `query` Türkçe serbest metindir.
 */
export async function fetchGoogleNewsHistory(
  query: string,
  notes: string[],
): Promise<FeedItemLite[]> {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return [];

  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(cleaned) +
    "&hl=tr&gl=TR&ceid=TR:tr";

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      notes.push(`Google Haberler atlandı (HTTP ${response.status}).`);
      return [];
    }

    const xml = await response.text();

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map((match): FeedItemLite | null => {
        const block = match[1];

        const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
        const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
        if (!title || !link) return null;

        const publishedRaw = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
        const publishedAt =
          publishedRaw && !Number.isNaN(new Date(publishedRaw).getTime())
            ? new Date(publishedRaw)
            : null;

        const domain = extractSourceDomain(block);

        return {
          feed: "Google Haberler",
          kind: "news" as const,
          title,
          link,
          summary: "",
          publishedAt,
          domain,
        } satisfies FeedItemLite;
      })
      .filter((item): item is FeedItemLite => item !== null && Boolean(item.domain));

    notes.push(`Google Haberler (“${cleaned}”): ${items.length} sonuç.`);
    return items;
  } catch (error) {
    notes.push(`Google Haberler atlandı: ${(error as Error).message.slice(0, 120)}`);
    return [];
  }
}
