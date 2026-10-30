import { buildRssXml, loadFeedItems, siteBase, xmlResponse } from "@/lib/feeds";
import { CATEGORIES, isCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: encodeURIComponent(category) }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ category: string }> },
) {
  const { category: raw } = await context.params;
  const category = decodeURIComponent(raw);

  if (!isCategory(category)) {
    return new Response("Kategori bulunamadı", { status: 404 });
  }

  const items = await loadFeedItems(30, category);

  return xmlResponse(
    buildRssXml({
      title: `TCFH News — ${category}`,
      description: `${category} kategorisindeki sentezlenmiş haberler.`,
      link: `${siteBase()}/rss/${encodeURIComponent(category)}`,
      items,
    }),
  );
}
