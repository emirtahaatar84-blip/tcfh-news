import Link from "next/link";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { Feed } from "@/components/Feed";
import { InterestFilter } from "@/components/feed/InterestFilter";
import { telegramBotUrl } from "@/lib/telegram";
import { listDigests } from "@/lib/digest";
import { ThreeColumn } from "@/components/layout/ThreeColumn";
import type { RailItem } from "@/components/layout/rail-types";
import {
  categoryFromSlug,
  normalizeCategory,
  slugForCategory,
} from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import {
  buildNewsWhere,
  FEED_PAGE_SIZE,
  filtersToSearchParams,
  parseFeedPage,
  type FeedFilters,
} from "@/lib/news-query";
import { serializeNewsItem } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";
import { serializePortraitCard } from "@/lib/portrait-types";

/** Sunucunun derin bağlantıda render ettiği en yüksek sayfa (120 kart). */
export const MAX_RENDER_PAGE = 6;

export type FeedSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type Props = {
  lang: string;
  searchParams: FeedSearchParams;
  /** "/tr", "/tr/akis", "/tr/haberler" */
  basePath: string;
};

/**
 * 3 kolonlu akış sayfası (ana sayfa + /akis + /haberler ortak gövdesi).
 *
 * Tüm veri sunucuda hazırlanır: sol/sağ kolon statiktir, orta kolon
 * sonsuz akar. URL parametreleri: kategori, sirala, sayfa, q.
 */
export async function FeedView({ lang: rawLang, searchParams, basePath }: Props) {
  if (!isLocale(rawLang)) notFound();
  const lang: Locale = rawLang;
  // FAZ 4 — Telegram linki (env'den) ve son sesli bülten var mı.
  const telegramUrl = telegramBotUrl();
  const latestDigest = (await listDigests(1))[0] ?? null;

  const category = categoryFromSlug(first(searchParams.kategori));
  const sort = first(searchParams.sirala) === "okunan" ? "okunan" : "yeni";
  const query = (first(searchParams.q) ?? "").trim().slice(0, 100) || null;
  const requestedPage = parseFeedPage(
    first(searchParams.sayfa) ?? undefined,
    MAX_RENDER_PAGE,
  );
  const pageSize = FEED_PAGE_SIZE;

  const filters: FeedFilters = {
    query,
    categories: category ? [category] : [],
    dateRange: "all",
    sources: [],
    readingTime: null,
  };

  const where = buildNewsWhere(filters);
  const wanted = requestedPage * pageSize;

  const [dict, rows, portraitRows, totalNews] = await Promise.all([
    getDictionary(lang),
    prisma.newsItem.findMany({
      where,
      orderBy:
        sort === "okunan"
          ? [{ viewCount: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      take: wanted + 1,
    }),
    prisma.portrait.findMany({
      where: { status: "published", removedAt: null },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.newsItem.count({ where }),
  ]);

  const initialItems = rows.slice(0, wanted).map(serializeNewsItem);
  const initialHasMore = rows.length > wanted;

  const portraitCards = portraitRows.map(serializePortraitCard);
  const portraits = portraitCards.slice(0, 12);

  // LCP: akıştaki ilk görseli erkenden keşfettir.
  const lcpImage = initialItems.find((item) => item.imageUrl)?.imageUrl;
  if (lcpImage) {
    preload(lcpImage, { as: "image", fetchPriority: "high" });
  }

  // "Günün özeti": son 5 içerik (portre + haber).
  const summary: RailItem[] = [
    ...portraitCards.slice(0, 4).map((portrait) => ({
      key: `p-${portrait.id}`,
      title: portrait.title,
      subtitle: portrait.subtitle,
      href: `/${lang}/portre/${portrait.slug}`,
      badge: dict.content.portrait,
      when: portrait.publishedAt,
    })),
    ...initialItems.slice(0, 5).map((item) => ({
      key: `n-${item.id}`,
      title: item.title,
      subtitle: item.summary,
      href: `/${lang}/haber/${item.slug}`,
      badge: dict.content.news,
      when: item.createdAt,
    })),
  ]
    .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))
    .slice(0, 5);

  const important: RailItem[] = summary.slice(0, 3);

  // API: sayfa hariç sorgu dizesi (limit dahil).
  const apiParams = filtersToSearchParams(filters, {
    limit: String(pageSize),
  });
  if (sort === "okunan") apiParams.set("sirala", "okunan");
  apiParams.delete("page");
  const apiQuery = apiParams.toString();

  // Tarayıcı adresi: sayfa hariç.
  const pageParams = new URLSearchParams();
  if (category) pageParams.set("kategori", slugForCategory(category));
  if (sort === "okunan") pageParams.set("sirala", "okunan");
  if (query) pageParams.set("q", query);
  const pageQuery = pageParams.toString();

  const activeSlug = category ? slugForCategory(category) : "";

  const categoryLabels: Record<string, string> = {
    ...dict.categories,
  };

  return (
    <ThreeColumn
      lang={lang}
      dict={dict}
      categories={categoryLabels}
      activeCategorySlug={activeSlug}
      summary={summary}
      important={important}
      portraits={portraits.slice(0, 3)}
      radioItems={initialItems.slice(0, 20)}
    >
      {category || query ? (
        <p className="mb-space-3 flex flex-wrap items-center gap-inline text-[11px] text-zinc-500">
          <span className="rounded-full border border-[#22252a] bg-[#16181c] px-space-3 py-space-1 font-semibold text-zinc-300">
            {category
              ? categoryLabels[normalizeCategory(category)] ?? category
              : `“${query}”`}
          </span>
          <span>{totalNews} içerik</span>
          <a
            href={`/${lang}`}
            className="ml-auto rounded-full border border-[#22252a] px-space-3.5 py-space-1 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
          >
            {dict.filters.clearAll}
          </a>
        </p>
      ) : null}

      {/* FAZ 4 — Telegram aboneliği + günün özeti kısayolları. */}
      <div className="mb-space-4 flex flex-wrap items-center gap-space-2">
        {telegramUrl ? (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-full border border-[#229ED9]/40 bg-[#229ED9]/10 px-space-4 text-meta font-semibold text-[#7fc9ea] transition hover:bg-[#229ED9]/20"
          >
            <span aria-hidden="true">✈</span>
            {dict.podcast.telegramCta ?? "Telegram"}
          </a>
        ) : null}

        {latestDigest ? (
          <Link
            href={`/${lang}/podcast`}
            className="inline-flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-full border border-[#22252a] px-space-4 text-meta font-semibold text-zinc-300 transition hover:border-[#31363e] hover:text-zinc-100"
          >
            <span aria-hidden="true">♪</span>
            {dict.podcast.listenToday ?? "Sesli dinle"}
          </Link>
        ) : null}
      </div>

      {/* FAZ 3.3 — kişisel ilgi filtresi (localStorage; sunucuya gitmez). */}
      <div className="mb-space-4">
        <InterestFilter labels={dict.interests} />
      </div>

      <Feed
        lang={lang}
        initialItems={initialItems}
        initialHasMore={initialHasMore}
        initialPage={requestedPage}
        apiQuery={apiQuery}
        pageQuery={pageQuery}
        basePath={basePath}
        portraits={portraits}
        labels={{
          feed: dict.feed,
          card: dict.card,
          categories: dict.categories,
          common: dict.common,
          shell: dict.shell,
        }}
      />
    </ThreeColumn>
  );
}
