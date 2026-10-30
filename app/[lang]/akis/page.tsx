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
 * /akis — adreslenebilir akış (/akis?sayfa=2&kategori=spor&sirala=okunan).
 * Ana sayfayla aynı 3 kolonlu gövdeyi kullanır; kanonik adres ana sayfadır.
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

  return {
    title: page > 1 ? `${dict.navMain.feed} · ${page}` : dict.navMain.feed,
    description: dict.meta.description,
    robots: { index: false, follow: true },
    alternates: {
      canonical: `/${lang}`,
      languages: { "tr-TR": "/tr", en: "/en" },
    },
  };
}

export default async function FeedAliasPage({ params, searchParams }: PageProps) {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const resolved = await searchParams;

  return <FeedView lang={lang} searchParams={resolved} basePath={`/${lang}/akis`} />;
}
