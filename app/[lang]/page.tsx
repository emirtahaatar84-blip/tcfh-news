import type { Metadata } from "next";
import { FeedView, type FeedSearchParams } from "@/components/feed/FeedPage";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n-config";
import { parseFeedPage } from "@/lib/news-query";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<FeedSearchParams>;
};

/**
 * Ana sayfa — 3 kolonlu akış.
 * Sol: arama + kategoriler · Orta: sonsuz akış · Sağ: özet / portreler / radyo.
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const resolved = await searchParams;
  const dict = await getDictionary(lang);
  const page = parseFeedPage(
    Array.isArray(resolved.sayfa) ? resolved.sayfa[0] : resolved.sayfa,
  );
  const filtered = Boolean(resolved.kategori || resolved.q);

  return {
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { "tr-TR": "/tr", en: "/en", "x-default": "/tr" },
    },
    // Filtrelenmiş ve sayfa 2+ adresleri aynı içeriğin varyantıdır.
    robots:
      filtered || page > 1
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

export default async function HomePage({ params, searchParams }: PageProps) {
  const { lang } = await params;
  const resolved = await searchParams;

  return (
    <FeedView
      lang={lang}
      searchParams={resolved}
      basePath={`/${isLocale(lang) ? lang : "tr"}`}
    />
  );
}
