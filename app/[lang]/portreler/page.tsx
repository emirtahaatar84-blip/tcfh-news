import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortraitCard } from "@/components/PortraitCard";
import { PortraitFilters } from "@/components/PortraitFilters";
import { SparklesIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/datetime";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import {
  buildPortraitOrderBy,
  buildPortraitWhere,
  hasPortraitFilters,
  parsePortraitFilters,
} from "@/lib/portrait-query";
import { serializePortraitCard } from "@/lib/portrait-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
};

const PAGE_SIZE = 12;

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);
  const filters = parsePortraitFilters(await searchParams);

  return {
    title: dict.portraits.title,
    description: dict.portraits.subtitle,
    alternates: {
      canonical: filters.query ? undefined : `/${lang}/portreler`,
      languages: {
        "tr-TR": "/tr/portreler",
        en: "/en/portreler",
      },
    },
    robots: filters.query
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function PortraitsIndexPage({
  params,
  searchParams,
}: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);
  const filters = parsePortraitFilters(await searchParams);

  const where = buildPortraitWhere(filters);

  const [rows, total] = await Promise.all([
    prisma.portrait.findMany({
      where,
      orderBy: buildPortraitOrderBy(filters.sort),
      take: PAGE_SIZE,
    }),
    prisma.portrait.count({ where }),
  ]);

  // Son yayınlanan portre — sayfa üstünde görünür (İŞ 1.5).
  const latest = await prisma.portrait.findFirst({
    where: { status: "published", removedAt: null },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });

  const lastPublishedAt = latest?.publishedAt ?? null;
  const staleHours = lastPublishedAt
    ? (Date.now() - lastPublishedAt.getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;
  // 24 saatten uzun süre yeni portre yoksa sessiz bilgi satırı gösterilir.
  const showScheduleNotice = staleHours > 24;

  const items = rows.map(serializePortraitCard);
  const filtered = hasPortraitFilters(filters);

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
            {dict.portraits.title}
          </li>
        </ol>
      </nav>

      <header>
        <h1 className="t-h1 flex items-center gap-space-2 text-zinc-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <SparklesIcon className="h-4 w-4" />
          </span>
          {dict.portraits.title}
        </h1>
        <p className="mt-space-2 max-w-2xl text-xs leading-relaxed text-zinc-500">
          {dict.portraits.subtitle}
        </p>
        {lastPublishedAt ? (
          <p className="mt-space-1 text-[11px] text-zinc-500">
            {dict.portraits.lastPortrait.replace(
              "{date}",
              formatDateTime(lastPublishedAt, lang),
            )}
          </p>
        ) : null}
        {showScheduleNotice ? (
          <p className="mt-space-1 text-[11px] text-zinc-500">
            {dict.portraits.scheduleNotice}
          </p>
        ) : null}
      </header>

      <div className="mt-space-4">
        <PortraitFilters
          lang={lang}
          filters={filters}
          total={total}
          labels={dict.portraits.filters}
        />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-space-5 py-space-9 text-center">
          <SparklesIcon className="mb-space-3 h-6 w-6 text-zinc-600" />
          <h2 className="text-base font-medium text-zinc-300">
            {dict.portraits.filters.empty}
          </h2>
          <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-zinc-500">
            {dict.portraits.filters.emptyHint}
          </p>
          {filtered ? (
            <Link href={`/${lang}/portreler`} className="btn-secondary mt-space-5">
              {dict.portraits.filters.clear}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="mt-space-4 grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((portrait) => (
            <li key={portrait.id}>
              <PortraitCard
                portrait={portrait}
                locale={lang}
                labels={dict.portraits.card}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-space-5 rounded-xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-[10px] leading-relaxed text-zinc-500">
        {dict.portraits.methodologyShort}
      </p>
    </div>
  );
}
