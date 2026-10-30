import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebateCard } from "@/components/debate/DebateCard";
import { DebateRail } from "@/components/debate/DebateRail";
import { LevelTabs, type DebateLevelFilter } from "@/components/debate/LevelTabs";
import { ThreeColumn } from "@/components/layout/ThreeColumn";
import { InboxIcon } from "@/components/icons";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import {
  FEED_NAV_CATEGORIES,
  normalizeCategory,
  slugForCategory,
} from "@/lib/categories";
import {
  debateFiltersToQuery,
  getDebateArchive,
  parseDebateFilters,
  type DebateFilters,
} from "@/lib/debate/query";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE_SUFFIX = "/munazara/arsiv";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";

  return {
    title: "Münazara arşivi",
    description:
      "Geçmiş münazara dosyaları: seviye, kategori ve sıralamaya göre filtrelenebilir.",
    alternates: {
      canonical: `/${lang}${BASE_SUFFIX}`,
      languages: {
        "tr-TR": `/tr${BASE_SUFFIX}`,
        en: `/en${BASE_SUFFIX}`,
      },
    },
    robots: { index: false, follow: true },
  };
}

export default async function DebateArchivePage({
  params,
  searchParams,
}: PageProps) {
  const { lang: rawLang } = await params;
  if (!isLocale(rawLang)) notFound();
  const lang: Locale = rawLang;

  const resolved = await searchParams;
  const filters = parseDebateFilters(resolved);
  const base = `/${lang}${BASE_SUFFIX}`;

  const [dict, entries] = await Promise.all([
    getDictionary(lang),
    getDebateArchive(lang, filters),
  ]);

  const levelHref = (level: DebateLevelFilter) =>
    `${base}${debateFiltersToQuery({ ...filters, level })}`;

  const setCategory = (category: string) =>
    `${base}${debateFiltersToQuery({
      ...filters,
      category,
    })}`;

  const setSort = (sort: DebateFilters["sort"]) =>
    `${base}${debateFiltersToQuery({ ...filters, sort })}`;

  const cardLabels = {
    reading: dict.shell.debateReading,
    listening: dict.shell.debateListening,
    verified: dict.shell.debateVerified,
    cta: dict.shell.debateCardCta,
  };

  return (
    <ThreeColumn
      lang={lang}
      dict={dict}
      categories={{}}
      activeCategorySlug=""
      summary={[]}
      important={[]}
      portraits={[]}
      radioItems={[]}
      right={<DebateRail lang={lang} dict={dict} />}
    >
      <nav aria-label="breadcrumb" className="mb-space-2">
        <ol className="flex flex-wrap items-center gap-space-2 text-[11px] text-zinc-500">
          <li>
            <Link href={`/${lang}`} className="hover:text-zinc-300">
              {dict.breadcrumb.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/${lang}/munazara`} className="hover:text-zinc-300">
              Münazara
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-zinc-400">{dict.shell.debateArchive}</li>
        </ol>
      </nav>

      <h1 className="t-h1 text-zinc-50">
        {dict.shell.debateArchive}
      </h1>
      <p className="mt-space-1 text-[11px] leading-relaxed text-zinc-500">
        {dict.shell.debateArchiveHint}
      </p>

      <div className="mt-space-3 flex flex-wrap items-center gap-space-2">
        <LevelTabs
          lang={lang}
          current={filters.level}
          options={[
            { value: "tumu", label: dict.shell.debateAll, href: levelHref("tumu") },
            { value: "lise", label: dict.shell.debateLise, href: levelHref("lise") },
            {
              value: "universite",
              label: dict.shell.debateUniversite,
              href: levelHref("universite"),
            },
          ]}
          panelId="debate-archive-list"
          label={dict.shell.debateLevel}
        />

        <span className="t-label text-zinc-500">
          {entries.length} {lang === "tr" ? "kayıt" : "records"}
        </span>
      </div>

      <div className="mt-space-3 space-y-space-2">
        <div className="flex flex-wrap items-center gap-space-1">
          <Link
            href={setCategory("")}
            aria-current={filters.category === "" ? "true" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full border px-space-3 text-[11px] font-semibold transition ${
              filters.category === ""
                ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                : "border-[#22252a] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {dict.shell.all}
          </Link>
          {FEED_NAV_CATEGORIES.map((category) => {
            const slug = slugForCategory(category);
            const active = filters.category === slug;
            return (
              <Link
                key={slug}
                href={setCategory(slug)}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-space-3 text-[11px] font-semibold transition ${
                  active
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                    : "border-[#22252a] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {dict.categories[category] ?? category}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-space-1 t-label text-zinc-500">
          <span className="font-bold uppercase tracking-wide">
            {lang === "tr" ? "Sırala" : "Sort"}:
          </span>
          {(
            [
              { key: "mus", label: "MUS" },
              { key: "yeni", label: lang === "tr" ? "Yeni" : "Newest" },
              { key: "okunan", label: lang === "tr" ? "Okunan" : "Most read" },
            ] as const
          ).map((option) => (
            <Link
              key={option.key}
              href={setSort(option.key)}
              aria-current={filters.sort === option.key ? "true" : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-full px-space-3 font-semibold transition ${
                filters.sort === option.key
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div id="debate-archive-list" className="mt-space-3">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#22252a] bg-[#16181c] px-space-5 py-space-8 text-center">
            <InboxIcon className="mb-space-3 h-6 w-6 text-zinc-600" aria-hidden="true" />
            <p className="text-sm text-zinc-300">{dict.shell.debateEmpty}</p>
            <Link href={`/${lang}/munazara`} className="btn-secondary mt-space-4">
              {dict.shell.debateAll}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-space-3 sm:grid-cols-2 3col:grid-cols-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <DebateCard
                  debate={entry}
                  locale={lang}
                  labels={cardLabels}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {filters.category ? (
        <p className="mt-space-3 t-label text-zinc-500">
          {dict.categories[normalizeCategory(filters.category)] ??
            filters.category}
        </p>
      ) : null}
    </ThreeColumn>
  );
}
