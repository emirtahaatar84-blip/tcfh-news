import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArticleIcon,
  BookmarkFilledIcon,
  ChevronRightIcon,
  CompassIcon,
  MicIcon,
  SettingsIcon,
  SparklesIcon,
  TrophyIcon,
} from "@/components/icons";
import { CATEGORIES, avatarClassesFor } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.categoriesPage.title,
    description: dict.categoriesPage.subtitle,
    alternates: {
      canonical: `/${lang}/kategoriler`,
      languages: { "tr-TR": "/tr/kategoriler", en: "/en/kategoriler" },
    },
  };
}

export default async function CategoriesPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  const [newsCounts, portraitCounts] = await Promise.all([
    prisma.newsItem.groupBy({
      by: ["category"],
      where: { removedAt: null },
      _count: { _all: true },
    }),
    prisma.portrait.groupBy({
      by: ["category"],
      where: { status: "published", removedAt: null },
      _count: { _all: true },
    }),
  ]);

  const newsByCategory = new Map(
    newsCounts.map((row) => [row.category, row._count._all]),
  );
  const portraitByCategory = new Map(
    portraitCounts.map((row) => [row.category, row._count._all]),
  );

  const sections = [
    {
      href: `/${lang}/haberler`,
      label: dict.sections.news,
      hint: dict.sections.newsHint,
      Icon: ArticleIcon,
      tint: "text-sky-300",
    },
    {
      href: `/${lang}/portreler`,
      label: dict.sections.portraits,
      hint: dict.sections.portraitsHint,
      Icon: SparklesIcon,
      tint: "text-violet-300",
    },
    {
      href: `/${lang}/podcast`,
      label: dict.sections.podcast,
      hint: dict.sections.podcastHint,
      Icon: MicIcon,
      tint: "text-red-300",
    },
    {
      href: `/${lang}/blog`,
      label: dict.sections.blog,
      hint: dict.sections.blogHint,
      Icon: ArticleIcon,
      tint: "text-amber-300",
    },
    {
      href: `/${lang}/assistant`,
      label: dict.sections.assistant,
      hint: dict.sections.assistantHint,
      Icon: SparklesIcon,
      tint: "text-cyan-300",
    },
    {
      href: `/${lang}/bookmarks`,
      label: dict.sections.bookmarks,
      hint: dict.sections.bookmarksHint,
      Icon: BookmarkFilledIcon,
      tint: "text-blue-300",
    },
    {
      href: `/${lang}/achievements`,
      label: dict.sections.achievements,
      hint: dict.sections.achievementsHint,
      Icon: TrophyIcon,
      tint: "text-emerald-300",
    },
    {
      href: `/${lang}/profile`,
      label: dict.sections.profile,
      hint: dict.sections.profileHint,
      Icon: SettingsIcon,
      tint: "text-zinc-300",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-space-3 pb-space-7 pt-space-3 sm:px-space-5">
      <nav aria-label="breadcrumb" className="mb-space-3">
        <ol className="flex items-center gap-space-2 text-[11px] text-zinc-500">
          <li>
            <Link href={`/${lang}`} className="hover:text-zinc-300">
              {dict.breadcrumb.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-zinc-400">
            {dict.categoriesPage.title}
          </li>
        </ol>
      </nav>

      <h1 className="t-h1 flex items-center gap-space-2 text-zinc-100">
        <CompassIcon className="h-5 w-5 text-blue-400" />
        {dict.categoriesPage.title}
      </h1>
      <p className="mt-space-2 text-xs leading-relaxed text-zinc-500">
        {dict.categoriesPage.subtitle}
      </p>

      {/* Bölümler: mobilde üst menüye erişemeyen sayfalar burada, 1 dokunuş. */}
      <section className="mt-space-4" aria-labelledby="sections-title">
        <h2 id="sections-title" className="section-title mb-space-2">
          {dict.sections.title}
        </h2>
        <ul className="grid grid-cols-1 gap-space-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="group flex min-h-[44px] items-center gap-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-2 transition hover:border-[#31363e] hover:bg-[#1d2026]"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#22252a] ${section.tint}`}
                >
                  <section.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-zinc-200">
                    {section.label}
                  </span>
                  <span className="block text-[10px] text-zinc-500">
                    {section.hint}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="section-title mt-space-5 mb-space-2">
        {dict.categoriesPage.title}
      </h2>
      <h2 className="section-title mt-space-5 mb-space-2">
        {dict.categoriesPage.title}
      </h2>
      <ul className="grid grid-cols-2 gap-space-2 sm:grid-cols-3 lg:grid-cols-4">
        <li>
          <Link
            href={`/${lang}/haberler`}
            className="group flex h-full min-h-[44px] items-center gap-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3 transition hover:border-[#31363e] hover:bg-[#1d2026]"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#22252a] bg-zinc-500/10 text-[11px] font-bold uppercase text-zinc-300"
            >
              ★
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-zinc-200">
                {dict.sections.all}
              </span>
              <span className="block text-[10px] text-zinc-500">
                {dict.categoriesPage.count.replace(
                  "{count}",
                  String(
                    [...newsByCategory.values()].reduce((sum, value) => sum + value, 0),
                  ),
                )}
              </span>
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
          </Link>
        </li>
        {CATEGORIES.map((category) => {
          const total =
            (newsByCategory.get(category) ?? 0) +
            (portraitByCategory.get(category) ?? 0);

          return (
            <li key={category}>
              <Link
                href={`/${lang}/kategori/${encodeURIComponent(category)}`}
                className="group flex h-full items-center gap-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3 transition hover:border-[#31363e] hover:bg-[#1d2026]"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#22252a] text-[11px] font-bold uppercase ${avatarClassesFor(category)}`}
                >
                  {category.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-zinc-200">
                    {category}
                  </span>
                  <span className="block text-[10px] text-zinc-500">
                    {dict.categoriesPage.count.replace("{count}", String(total))}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
