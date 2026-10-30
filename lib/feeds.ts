import { prisma } from "@/lib/prisma";

/**
 * RSS / sitemap yardımcıları. Tüm çıktılar anonim ve herkese açıktır;
 * kişisel veri içermez.
 */

export function siteBase(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteBase()}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type FeedItemRow = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  category: string;
  createdAt: Date;
};

export async function loadFeedItems(
  limit = 40,
  category?: string,
): Promise<FeedItemRow[]> {
  return prisma.newsItem.findMany({
    where: { removedAt: null, ...(category ? { category } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      createdAt: true,
    },
  });
}

export function buildRssXml(options: {
  title: string;
  description: string;
  link: string;
  items: FeedItemRow[];
}): string {
  const base = siteBase();

  const items = options.items
    .map((item) => {
      const url = `${base}/tr/haber/${item.slug ?? item.id}`;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(item.summary)}</description>
      <category>${escapeXml(item.category)}</category>
      <pubDate>${item.createdAt.toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(options.title)}</title>
    <link>${escapeXml(options.link)}</link>
    <description>${escapeXml(options.description)}</description>
    <language>tr-TR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(options.link)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}

/**
 * Atom 1.0 akışı (RFC 4287). RSS'in yanında sunulur; bazı okuyucular ve
 * agregatörler (Feedly, Inoreader, NewsBlur) Atom'u tercih eder.
 */
export function buildAtomXml(options: {
  title: string;
  description: string;
  link: string;
  items: FeedItemRow[];
}): string {
  const base = siteBase();
  const updated = new Date().toISOString();

  const entries = options.items
    .map((item) => {
      const url = `${base}/tr/haber/${item.slug ?? item.id}`;
      return `  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(url)}" />
    <id>${escapeXml(url)}</id>
    <updated>${item.createdAt.toISOString()}</updated>
    <published>${item.createdAt.toISOString()}</published>
    <summary>${escapeXml(item.summary)}</summary>
    <category term="${escapeXml(item.category)}" />
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="tr">
  <title>${escapeXml(options.title)}</title>
  <subtitle>${escapeXml(options.description)}</subtitle>
  <link href="${escapeXml(options.link)}" rel="self" type="application/atom+xml" />
  <link href="${escapeXml(base)}" rel="alternate" type="text/html" />
  <id>${escapeXml(options.link)}</id>
  <updated>${updated}</updated>
${entries}
</feed>`;
}

/**
 * XML yanıtı. `contentType` verilmezse gövdeden tahmin edilir
 * (<feed> → Atom, <rss> → RSS) — böylece tek yardımcı ikisine de hizmet eder.
 */
export function xmlResponse(
  body: string,
  contentType = "application/rss+xml; charset=utf-8",
): Response {
  const type = contentType.includes("atom") || body.includes("<feed xmlns=")
    ? "application/atom+xml; charset=utf-8"
    : "application/rss+xml; charset=utf-8";

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
