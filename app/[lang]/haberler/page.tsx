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
 * "Haberler" sayfası korunur; aynı 3 kolonlu akış gövdesini kullanır.
 * Filtreler URL'de yaşar (kategori, q, sirala, sayfa).
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);
  const resolved = await searchParams;
  const page = parseFeedPage(
    Array.isArray(resolved.sayfa) ? resolved.sayfa[0] : resolved.sayfa,
  );
  const filtered = Boolean(resolved.kategori || resolved.q);

  return {
    title: dict.nav.news,
    robots:
      filtered || page > 1
        ? { index: false, follow: true }
        : { index: true, follow: true },
    alternates: {
      canonical: `/${lang}/haberler`,
      languages: { "tr-TR": "/tr/haberler", en: "/en/haberler" },
    },
  };
}

export default async function NewsFeedPage({ params, searchParams }: PageProps) {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const resolved = await searchParams;

  return (
    <FeedView lang={lang} searchParams={resolved} basePath={`/${lang}/haberler`} />
  );
}
