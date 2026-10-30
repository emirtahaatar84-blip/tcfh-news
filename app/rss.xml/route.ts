import { buildRssXml, loadFeedItems, siteBase, xmlResponse } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await loadFeedItems(40);

  return xmlResponse(
    buildRssXml({
      title: "TCFH News — Gündem",
      description: "Yapay zekâ ile sentezlenmiş, çok kaynaklı Türkçe haber akışı.",
      link: `${siteBase()}/rss.xml`,
      items,
    }),
  );
}
