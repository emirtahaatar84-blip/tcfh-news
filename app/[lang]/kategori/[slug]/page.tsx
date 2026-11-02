import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortraitCard } from "@/components/PortraitCard";
import { CategoryNewsList } from "@/components/feed/CategoryNewsList";
import { badgeClassesFor, isCategory } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { serializePortraitCard } from "@/lib/portrait-types";
import { serializeNewsItem } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string; slug: string }> };

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const category = decodeURIComponent(slug);
  const dict = await getDictionary(lang);

  if (!isCategory(category)) return { title: undefined };

  return {
    title: (dict.categories as Record<string, string>)[category] ?? category,
    description: `${category} kategorisindeki portreler ve haberler.`,
    alternates: {
      canonical: `/${lang}/kategori/${encodeURIComponent(category)}`,
      languages: {
        "tr-TR": `/tr/kategori/${encodeURIComponent(category)}`,
        en: `/en/kategori/${encodeURIComponent(category)}`,
      },
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { lang: rawLang, slug } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  const category = decodeURIComponent(slug);
  if (!isCategory(category)) notFound();

  const [portraits, news] = await Promise.all([
    prisma.portrait.findMany({
      where: { status: "published", removedAt: null, category },
      orderBy: [{ publishedAt: "desc" }],
      take: PAGE_SIZE,
    }),
    prisma.newsItem.findMany({
      where: { removedAt: null, category },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
    }),
  ]);

  const portraitCards = portraits.map(serializePortraitCard);
  const newsItems = news.map(serializeNewsItem);
  const total = portraitCards.length + newsItems.length;

  return (
    <div className="mx-auto max-w-6xl px-space-3 pb-space-7 pt-space-3 sm:px-space-5">
      <nav aria-label="breadcrumb" className="mb-space-3">
        <ol className="flex flex-wrap items-center gap-space-2 text-[11px] text-zinc-500">
          <li>
            <Link href={`/${lang}`} className="hover:text-zinc-300">
              {dict.breadcrumb.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/${lang}/kategoriler`} className="hover:text-zinc-300">
              {dict.categoriesPage.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-zinc-400">
            {category}
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-space-2">
        <h1 className="t-h1 text-zinc-100">{category}</h1>
        <span className={`chip ${badgeClassesFor(category)}`}>
          {dict.categoriesPage.count.replace("{count}", String(total))}
        </span>
      </div>

      {total === 0 ? (
        <div className="mt-space-7 rounded-2xl border border-dashed border-[#22252a] px-space-5 py-space-8 text-center">
          <p className="text-sm text-zinc-400">{dict.categoriesPage.empty}</p>
          <Link href={`/${lang}`} className="btn-secondary mt-space-4">
            {dict.content.backToFeed}
          </Link>
        </div>
      ) : null}

      {portraitCards.length > 0 ? (
        <section aria-labelledby="cat-portraits" className="mt-space-5">
          <h2
            id="cat-portraits"
            className="text-xs font-bold uppercase tracking-wide text-zinc-400"
          >
            {dict.portraits.title}
          </h2>
          <ul className="mt-space-3 grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-3">
            {portraitCards.map((portrait) => (
              <li key={portrait.id}>
                <PortraitCard
                  portrait={portrait}
                  locale={lang}
                  labels={dict.portraits.card}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {newsItems.length > 0 ? (
        <section aria-labelledby="cat-news" className="mt-space-5">
          <h2
            id="cat-news"
            className="text-xs font-bold uppercase tracking-wide text-zinc-400"
          >
            {dict.home.latestNews}
          </h2>
          {/* Kategori haber listesi: NewsCard bir client bileşendir ve
              `onClose` olay işleyicisi ister. Sunucu bileşeninden fonksiyon
              geçirilemez ("Event handlers cannot be passed to Client
              Component props") — bu yüzden client sarmalayıcı kullanılır. */}
          <div className="mt-space-2 flex flex-col gap-space-3">
            <CategoryNewsList
              items={newsItems}
              locale={lang}
              dict={dict}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
