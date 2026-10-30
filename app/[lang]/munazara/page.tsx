import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebateCard } from "@/components/debate/DebateCard";
import { DebateCarousel } from "@/components/debate/DebateCarousel";
import { DebateRail } from "@/components/debate/DebateRail";
import { LevelTabs, type DebateLevelFilter } from "@/components/debate/LevelTabs";
import { ThreeColumn } from "@/components/layout/ThreeColumn";
import { InboxIcon } from "@/components/icons";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import {
  debateFiltersToQuery,
  getDebateList,
  parseDebateFilters,
  type DebateFilters,
} from "@/lib/debate/query";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function levelHref(
  base: string,
  filters: DebateFilters,
  level: DebateLevelFilter,
): string {
  return `${base}${debateFiltersToQuery({ ...filters, level })}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);
  const resolved = await searchParams;
  const filters = parseDebateFilters(resolved);
  const base = `/${lang}/munazara`;
  const filtered = filters.level !== "tumu" || Boolean(filters.category);

  return {
    title: `Münazara · ${dict.meta.title}`,
    description:
      "Lise ve üniversite formatında, kaynaklı münazara dosyaları: motion, taraflar, kilit çatışmalar, ispat yükü ve kanıt havuzu.",
    alternates: {
      canonical: filtered
        ? `${base}${debateFiltersToQuery(filters)}`
        : base,
      languages: {
        "tr-TR": "/tr/munazara",
        en: "/en/munazara",
        "x-default": "/tr/munazara",
      },
    },
    robots: { index: !filtered, follow: true },
  };
}

export default async function DebateFeedPage({
  params,
  searchParams,
}: PageProps) {
  const { lang: rawLang } = await params;
  if (!isLocale(rawLang)) notFound();
  const lang: Locale = rawLang;

  const resolved = await searchParams;
  const filters = parseDebateFilters(resolved);
  const base = `/${lang}/munazara`;

  const [dict, debates] = await Promise.all([
    getDictionary(lang),
    getDebateList(lang, { filters, take: 60 }),
  ]);

  const tabs = [
    { value: "tumu" as const, label: dict.shell.debateAll, href: levelHref(base, filters, "tumu") },
    { value: "lise" as const, label: dict.shell.debateLise, href: levelHref(base, filters, "lise") },
    {
      value: "universite" as const,
      label: dict.shell.debateUniversite,
      href: levelHref(base, filters, "universite"),
    },
  ];

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
      <div className="mb-space-3 flex flex-wrap items-center justify-between gap-space-2">
        <div>
          <h1 className="t-h1 text-zinc-50">
            Münazara
          </h1>
          <p className="mt-space-1 max-w-xl text-[11px] leading-relaxed text-zinc-500">
            Hükümet konuyu savunan, Muhalefet karşı çıkan taraftır. Her dosya
            kamuya açık kaynaklardan derlenir; oy veya kullanıcı argümanı
            toplanmaz.
          </p>
        </div>
        <Link
          href={`${base}/arsiv`}
          className="inline-flex min-h-[44px] items-center rounded-full border border-[#22252a] bg-[#16181c] px-space-4 text-[12px] font-semibold text-zinc-300 transition hover:text-zinc-100"
        >
          {dict.shell.debateArchive}
        </Link>
      </div>

      <div className="mb-space-3 flex flex-wrap items-center gap-space-2">
        <LevelTabs
          lang={lang}
          current={filters.level}
          options={tabs}
          panelId="debate-feed"
          label={dict.shell.debateLevel}
        />
        <span className="t-label text-zinc-500">
          {debates.length} {lang === "tr" ? "dosya" : "files"}
        </span>
      </div>

      <div
        id="debate-feed"
        role="tabpanel"
        aria-label={dict.shell.debateLevel}
        className="block-stack"
      >
        {debates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#22252a] bg-[#16181c] px-space-5 py-space-8 text-center">
            <InboxIcon className="mb-space-3 h-6 w-6 text-zinc-600" aria-hidden="true" />
            <p className="text-sm text-zinc-300">{dict.shell.debateEmpty}</p>
            <Link href={base} className="btn-secondary mt-space-4">
              {dict.shell.debateAll}
            </Link>
          </div>
        ) : (
          <>
            <DebateCarousel
              debates={debates.slice(0, 8)}
              locale={lang}
              labels={{
                ...cardLabels,
                previous: dict.shell.debatePrevCard,
                next: dict.shell.debateNextCard,
                region: dict.shell.debateCarousel,
              }}
            />

            <section aria-labelledby="debate-all">
              <h2
                id="debate-all"
                className="mb-space-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400"
              >
                {lang === "tr" ? "Tüm münazaralar" : "All debates"}
              </h2>
              <ul className="grid gap-space-3 sm:grid-cols-2 3col:grid-cols-1">
                {debates.map((debate) => (
                  <li key={debate.id}>
                    <DebateCard
                      debate={debate}
                      locale={lang}
                      labels={cardLabels}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </ThreeColumn>
  );
}
