import Link from "next/link";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { Feed } from "@/components/Feed";
import { InterestFilter } from "@/components/feed/InterestFilter";
import { rankByImportance, computeImportance } from "@/lib/importance";
import { dedupeByTopic } from "@/lib/dedupe";
import { NICHE_COPY } from "@/lib/niche";
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
      // "yeni" sıralaması artık UYGULAMA İÇİNDE yapılır (önem skoru).
      // Bu yüzden aday havuzu geniş tutulur: 3× sayfa boyutu.
      orderBy:
        sort === "okunan"
          ? [{ viewCount: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      take: sort === "okunan" ? wanted + 1 : Math.min(120, wanted * 3),
    }),
    prisma.portrait.findMany({
      where: { status: "published", removedAt: null },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.newsItem.count({ where }),
  ]);

  // ── ÖNEM SIRALAMASI + TEKRAR BASTIRMA ────────────────────────────────
  // Amaç: "her haberi" değil "gerekli haberleri" göstermek.
  //   1. Her adaya 0-100 önem skoru ver (kaynak, kategori, Türkiye ilgisi,
  //      tazelik, kalite).
  //   2. Skora göre sırala.
  //   3. Aynı konudan 24 saatte yalnızca birini bırak.
  //   4. İlk `wanted` tanesini göster.
  type Row = (typeof rows)[number];

  const candidates = rows.map((row: Row) => ({
    id: row.id,
    row,
    title: row.title,
    summary: row.summary,
    category: row.category,
    sourcesCount: row.sourcesCount,
    verifiedSourceCount: row.verifiedSourceCount,
    createdAt: row.createdAt,
    qualityScore: row.qualityScore,
    factCheckStatus: row.factCheckStatus,
  }));

  const ordered =
    sort === "okunan"
      ? candidates.map((item, index) => ({ ...item, index, score: 0 }))
      : rankByImportance(candidates).map((item, index) => ({
          ...item,
          index,
          score: item.importance.score,
        }));

  const deduped =
    sort === "okunan"
      ? ordered
      : (() => {
          const result = dedupeByTopic(ordered, { scoreOf: (item) => item.score });
          // Bastırılanların sırasını korumak için orijinal index'e göre diz.
          return result.kept.sort((a, b) => a.index - b.index);
        })();

  // NİŞ HERO: yalnızca ana sayfa, filtresiz, ilk sayfa.
  const showHero = !category && !query && sort !== "okunan" && requestedPage === 1;

  // ÖNE ÇIKANLAR: yalnızca ana sayfa, filtresiz görünümde ilk 3 "top story".
  const topStories =
    !category && !query && sort !== "okunan"
      ? ordered
          .filter((entry) => {
            const imp = (entry as { importance?: { isTopStory: boolean } }).importance;
            return imp?.isTopStory === true;
          })
          .slice(0, 3)
          .map((entry) => ({
            id: entry.row.id,
            slug: entry.row.slug ?? entry.row.id,
            title: entry.row.title,
            category: entry.row.category,
            verifiedSourceCount: entry.row.verifiedSourceCount,
          }))
      : [];

  const initialItems = deduped.slice(0, wanted).map((entry) => serializeNewsItem(entry.row));
  const initialHasMore =
    sort === "okunan" ? rows.length > wanted : deduped.length > wanted;

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

      {/* NİŞ HERO — sitenin kimliği. Yalnızca ana sayfada, filtresiz. */}
      {showHero ? (
        <header className="mb-space-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
            {NICHE_COPY[lang].coreTitle}
          </p>
          <h1 className="t-h1 mt-space-1 text-zinc-50">
            {NICHE_COPY[lang].tagline}
          </h1>
          <p className="mt-space-2 max-w-2xl text-xs leading-relaxed text-zinc-500">
            {lang === "en"
              ? "Also covering world affairs and followed clubs. Every story compared across sources."
              : "Dünya gündemi ve takip edilen kulüpler de akışta. Her haber birden fazla kaynakla karşılaştırılır."}
          </p>
        </header>
      ) : null}

      {/* ÖNE ÇIKANLAR — günün en yüksek önem skorlu haberleri.
          Yalnızca ana sayfada ve filtresiz görünümde gösterilir. */}
      {topStories.length > 0 ? (
        <section aria-labelledby="top-stories" className="mb-space-5">
          <h2 id="top-stories" className="section-title mb-space-3">
            {lang === "en" ? "Top stories" : "Öne çıkanlar"}
          </h2>
          <ol className="grid gap-space-2 sm:grid-cols-3">
            {topStories.map((story, index) => (
              <li key={story.id}>
                <Link
                  href={`/${lang}/haber/${story.slug}`}
                  className="group flex h-full flex-col gap-space-2 rounded-2xl border border-[#22252a] bg-[#16181c] p-space-3 transition hover:border-[#31363e]"
                >
                  <span className="flex items-center gap-space-2 text-[11px] font-bold text-blue-400">
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15"
                    >
                      {index + 1}
                    </span>
                    {story.category}
                    {story.verifiedSourceCount > 1 ? (
                      <span className="text-emerald-400">
                        · {story.verifiedSourceCount} kaynak
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-zinc-200 group-hover:text-zinc-50">
                    {story.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
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
