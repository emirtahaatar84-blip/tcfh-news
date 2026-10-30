import { prisma } from "@/lib/prisma";
import { escapeXml, siteBase } from "@/lib/feeds";

export const dynamic = "force-dynamic";

/**
 * Google News sitemap: son 48 saatte yayımlanan haberler (en fazla 1000).
 * Biçim: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
export async function GET() {
  const base = siteBase();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const items = await prisma.newsItem.findMany({
    where: { removedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, slug: true, title: true, createdAt: true },
  });

  const urls = items
    .map(
      (item) => `  <url>
    <loc>${escapeXml(`${base}/tr/haber/${item.slug ?? item.id}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>TCFH News</news:name>
        <news:language>tr</news:language>
      </news:publication>
      <news:publication_date>${item.createdAt.toISOString()}</news:publication_date>
      <news:title>${escapeXml(item.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
