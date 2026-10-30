import { buildAtomXml, loadFeedItems, siteBase, xmlResponse } from "@/lib/feeds";

export const dynamic = "force-dynamic";

/** GET /atom.xml — Atom 1.0 akışı (RSS'in yanında). */
export async function GET() {
  const items = await loadFeedItems(40);

  return xmlResponse(
    buildAtomXml({
      title: "TCFH News — Gündem",
      description: "Yapay zekâ ile sentezlenmiş, çok kaynaklı Türkçe haber akışı.",
      link: `${siteBase()}/atom.xml`,
      items,
    }),
  );
}
