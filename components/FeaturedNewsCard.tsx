import Link from "next/link";
import { CheckIcon, EyeIcon, PlayIcon } from "@/components/icons";
import { TimeAgo } from "@/components/TimeAgo";
import {
  accentClassesFor,
  handleForCategory,
} from "@/lib/categories";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem } from "@/lib/news-types";

type Props = {
  item: FeedNewsItem;
  locale: Locale;
  cardLabels: {
    share: string;
    copied: string;
    shareError: string;
    views: string;
    bookmark: string;
    removeBookmark: string;
    dismiss: string;
    verified: string;
    videoBadge: string;
  };
  categoryLabels: Record<string, string>;
};

/**
 * Akışın en üstündeki öne çıkan haber: büyük görsel, degrade geçiş ve
 * vurgulanmış tipografi ile manşet görünümü. Yalnızca filtresiz ana akışta
 * ve görseli olan en yeni haberde gösterilir.
 */
export function FeaturedNewsCard({
  item,
  locale,
  cardLabels,
  categoryLabels,
}: Props) {
  const detailHref = `/${locale}/haber/${item.slug}`;
  const handleText = handleForCategory(item.category);
  const handleHref = `/${locale}?category=${encodeURIComponent(item.category)}`;
  const handleClass = accentClassesFor(item.category);
  const categoryLabel = categoryLabels[item.category] ?? item.category;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c] transition-colors hover:border-[#31363e]">
      {/* Tam kart bağlantısı: iç içe <a> geçersizliğini önleyen kaplama. */}
      <Link
        href={detailHref}
        aria-label={item.title}
        className="absolute inset-0 z-0"
      />
      <div className="pointer-events-none relative z-10">
        {item.imageUrl ? (
          <div className="relative aspect-[16/7] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.title || ""}
              loading="eager"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
            {/* Manşet başlığını görselden ayıran degrade */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#16181c] via-[#16181c]/35 to-transparent"
            />
            {/* Video haberi: oynat göstergesi */}
            {item.isVideo && item.youtubeId ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                  <PlayIcon className="ml-space-1 h-6 w-6" />
                </span>
              </span>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 p-space-4 sm:p-space-5">
              <div className="flex flex-wrap items-center gap-inline">
                {item.isVideo ? (
                  <span className="inline-flex items-center gap-space-1 rounded-full border border-rose-500/25 bg-rose-500/15 px-space-3 py-space-1 text-[11px] font-semibold text-rose-300 backdrop-blur-sm">
                    <PlayIcon className="h-3 w-3" />
                    {cardLabels.videoBadge}
                  </span>
                ) : item.sourcesCount > 1 ? (
                  <span
                    className="inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/15 px-space-3 py-space-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-sm"
                    title={item.sources.join(", ")}
                  >
                    <CheckIcon className="h-3 w-3" />
                    {cardLabels.verified.replace(
                      "{count}",
                      String(item.sourcesCount),
                    )}
                  </span>
                ) : null}
                <span className="rounded-full bg-black/45 px-space-3 py-space-1 text-[11px] font-medium text-zinc-300 backdrop-blur-sm">
                  {categoryLabel}
                </span>
              </div>

              <h2 className="mt-space-2 text-lg font-bold leading-snug text-zinc-50 drop-shadow-sm sm:text-xl lg:text-2xl">
                {item.title}
              </h2>
            </div>
          </div>
        ) : (
          <h2 className="p-space-4 text-lg font-bold leading-snug text-zinc-50 sm:text-xl">
            {item.title}
          </h2>
        )}

        <div className="p-space-4 pt-space-3 sm:pt-space-4">
          {!item.imageUrl ? null : item.summary ? (
            <p className="line-clamp-2 t-lead text-zinc-300">
              {item.summary}
            </p>
          ) : null}

          <div className="mt-space-3 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 t-meta text-zinc-500">
            <Link
              href={handleHref}
              className={`pointer-events-auto font-bold transition hover:opacity-80 ${handleClass}`}
            >
              {handleText}
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              <TimeAgo date={item.createdAt} locale={locale} />
            </span>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex items-center gap-space-2"
              title={cardLabels.views}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              {item.viewCount}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
