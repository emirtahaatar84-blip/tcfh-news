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

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
