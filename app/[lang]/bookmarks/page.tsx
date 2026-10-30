import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryView } from "@/components/LibraryView";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.library.title,
    robots: { index: false, follow: false },
  };
}

export default async function BookmarksPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  return <LibraryView lang={lang} labels={dict.library} />;
}
