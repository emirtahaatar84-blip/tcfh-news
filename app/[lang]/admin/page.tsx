import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { prisma } from "@/lib/prisma";
import { serializeRssSource } from "@/lib/rss-source";
import { getSettings, toSafeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.admin.title,
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage({
  params,
  searchParams,
}: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  // ?tab=rss gibi derin bağlantılar için başlangıç sekmesi.
  const resolvedSearchParams = await searchParams;
  const tabParam = resolvedSearchParams.tab;
  const initialTab = Array.isArray(tabParam) ? tabParam[0] : tabParam;

  const [settings, sources, newsCount, activeSourceCount] =
    await Promise.all([
      getSettings(),
      prisma.rSSSource.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.newsItem.count({ where: { removedAt: null } }),
      prisma.rSSSource.count({ where: { isActive: true } }),
    ]);

  return (
    <AdminDashboard
      lang={lang}
      dict={dict.admin}
      portraits={dict.portraits}
      categoryLabels={dict.categories}
      backToFeed={dict.common.backToFeed}
      settings={toSafeSettings(settings)}
      sources={sources.map(serializeRssSource)}
      newsCount={newsCount}
      activeSourceCount={activeSourceCount}
      initialTab={initialTab}
    />
  );
}
