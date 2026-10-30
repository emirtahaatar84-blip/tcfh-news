import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HighlightText } from "@/components/HighlightText";
import { SearchForm } from "@/components/search/SearchForm";
import { AlertTriangleIcon, SparklesIcon } from "@/components/icons";
import { CATEGORIES, isCategory } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { formatDateTime } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
};

const MAX_QUERY = 100;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, MAX_QUERY);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.searchPage.title,
    description: dict.searchPage.subtitle,
    alternates: { canonical: `/${lang}/ara` },
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);
  const resolved = await searchParams;

  const query = first(resolved.q);
  const categoryRaw = first(resolved.category);
  const category = isCategory(categoryRaw) ? categoryRaw : null;

  const portraits = query
    ? await prisma.portrait.findMany({
        where: {
          status: "published",
          removedAt: null,
          ...(category ? { category } : {}),
          OR: [
            { title: { contains: query } },
            { subtitle: { contains: query } },
            { subjectName: { contains: query } },
            { keyFacts: { contains: query } },
          ],
        },
        orderBy: [{ publishedAt: "desc" }],
        take: 12,
      })
    : [];

  const news = query
    ? await prisma.newsItem.findMany({
        where: {
          removedAt: null,
          ...(category ? { category } : {}),
          OR: [
            { title: { contains: query } },
            { summary: { contains: query } },
            { sourcesList: { contains: query } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
      })
    : [];

  const total = portraits.length + news.length;

  return (
    <div className="mx-auto max-w-3xl px-space-3 pb-space-7 pt-space-4 sm:px-space-5">
      <h1 className="t-h1 text-zinc-100">
        {dict.searchPage.title}
      </h1>
      <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
        {dict.searchPage.subtitle}
      </p>

      <div className="mt-space-3">
        <SearchForm
          lang={lang}
          initialQuery={query}
          placeholder={dict.searchPage.placeholder}
          label={dict.searchPage.title}
          clearLabel={dict.searchPage.clear}
        />
      </div>

      <div className="scrollbar-hide mt-space-3 flex gap-space-2 overflow-x-auto pb-space-1">
        <Link
          href={`/${lang}/ara${query ? `?q=${encodeURIComponent(query)}` : ""}`}
          aria-current={!category ? "page" : undefined}
          className={`inline-flex min-h-[32px] shrink-0 items-center rounded-full border px-space-3 text-[11px] font-semibold transition ${
            !category
              ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
              : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {dict.categories.all}
        </Link>
        {CATEGORIES.map((item) => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          params.set("category", item);

          return (
            <Link
              key={item}
              href={`/${lang}/ara?${params.toString()}`}
              aria-current={category === item ? "page" : undefined}
              className={`inline-flex min-h-[32px] shrink-0 items-center rounded-full border px-space-3 text-[11px] font-semibold transition ${
                category === item
                  ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
                  : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {item}
            </Link>
          );
        })}
      </div>

      {query ? (
        <p aria-live="polite" className="mt-space-3 text-[11px] text-zinc-500">
          {dict.searchPage.results.replace("{count}", String(total))}
        </p>
      ) : null}

      {query && total === 0 ? (
        <div className="mt-space-6 rounded-2xl border border-[#22252a] bg-[#16181c] p-space-5 text-center">
          <AlertTriangleIcon className="mx-auto mb-space-2 h-5 w-5 text-amber-400" />
          <h2 className="text-base font-semibold text-zinc-200">
            {dict.searchPage.noResults}
          </h2>
          <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
            {dict.searchPage.noResultsHint}
          </p>
          <p className="mt-space-3 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            {dict.searchPage.tryCategories}
          </p>
          <div className="mt-space-2 flex flex-wrap justify-center gap-space-2">
            {CATEGORIES.slice(0, 6).map((item) => (
              <Link
                key={item}
                href={`/${lang}/kategori/${encodeURIComponent(item)}`}
                className="rounded-full border border-[#22252a] px-space-3 py-space-1 text-[11px] font-medium text-zinc-300 transition hover:border-[#31363e] hover:text-zinc-100"
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {portraits.length > 0 ? (
        <section aria-labelledby="search-portraits" className="mt-space-5">
          <h2
            id="search-portraits"
            className="text-xs font-bold uppercase tracking-wide text-zinc-400"
          >
            {dict.portraits.title}
          </h2>
          <ul className="mt-space-2 divide-y divide-[#22252a]/70">
            {portraits.map((portrait) => (
              <li key={portrait.id}>
                <Link
                  href={`/${lang}/portre/${portrait.slug}`}
                  className="group flex items-start gap-space-3 py-space-3"
                >
                  <span className="mt-space-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <SparklesIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-zinc-200 group-hover:text-zinc-50">
                      <HighlightText text={portrait.title} query={query} />
                    </span>
                    <span className="mt-space-1 block text-[10px] text-zinc-500">
                      {portrait.category}
                      {portrait.publishedAt
                        ? ` · ${formatDateTime(portrait.publishedAt, lang)}`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {news.length > 0 ? (
        <section aria-labelledby="search-news" className="mt-space-5">
          <h2
            id="search-news"
            className="text-xs font-bold uppercase tracking-wide text-zinc-400"
          >
            {dict.home.latestNews}
          </h2>
          <ul className="mt-space-2 divide-y divide-[#22252a]/70">
            {news.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/${lang}/haber/${item.slug ?? item.id}`}
                  className="group flex flex-col py-space-3"
                >
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-200 group-hover:text-zinc-50">
                    <HighlightText text={item.title} query={query} />
                  </span>
                  <span className="mt-space-1 text-[10px] text-zinc-500">
                    {item.category} · {formatDateTime(item.createdAt, lang)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!query ? (
        <p className="mt-space-5 text-center text-xs text-zinc-600">
          {dict.searchPage.subtitle}
        </p>
      ) : null}
    </div>
  );
}
