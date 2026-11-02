"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckIcon,
  EyeIcon,
  PlayIcon,
  XIcon,
} from "@/components/icons";
import { HighlightText } from "@/components/HighlightText";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { TimeAgo } from "@/components/TimeAgo";
import {
  accentClassesFor,
  avatarClassesFor,
  handleForCategory,
  slugForCategory,
} from "@/lib/categories";
import { matchNiche } from "@/lib/niche";
import type { Locale } from "@/lib/i18n-config";
import {
  STORAGE_EVENT,
  getPreferences,
  isRead,
  markRead,
  trackView,
} from "@/lib/local-store";
import type { FeedNewsItem } from "@/lib/news-types";

type Props = {
  item: FeedNewsItem;
  locale: Locale;
  bookmarksMode: boolean;
  query?: string | null;
  cardLabels: {
    share: string;
    copied: string;
    shareError: string;
    views: string;
    bookmark: string;
    removeBookmark: string;
    dismiss: string;
    verified: string;
    singleSource: string;
    singleSourceHint: string;
    videoBadge: string;
    save: string;
    saved: string;
    readLabel: string;
    listenLabel: string;
    actions: string;
  };
  categoryLabels: Record<string, string>;
  /** Kartı yalnızca bu oturumda kapat (state). */
  onClose: (id: string) => void;
  /** İlk kartlarda LCP için görseli öncelikli yükle. */
  priority?: boolean;
};

/**
 * Akış kartı: kategori avatarı, başlık (arama vurgulu), özet, doğrulama
 * rozeti, görsel ve alt eylem çubuğu (okunma, paylaş, kaydet, kapat).
 * Okundu işaretli haberler hafif solgun gösterilir.
 */
export const NewsCard = memo(function NewsCard({
  item,
  locale,
  bookmarksMode,
  query = null,
  cardLabels,
  categoryLabels,
  onClose,
  priority = false,
}: Props) {
  const router = useRouter();
  const [viewCount, setViewCount] = useState(item.viewCount);
  const [read, setRead] = useState(false);
  const [readMarksEnabled, setReadMarksEnabled] = useState(true);
  const [autoReadEnabled, setAutoReadEnabled] = useState(true);

  const cardRef = useRef<HTMLElement | null>(null);
  const viewCountedRef = useRef(false);
  const viewReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detailHref = `/${locale}/haber/${item.slug}`;

  function goToDetail() {
    router.push(detailHref);
  }

  function stop(event: React.MouseEvent | React.PointerEvent) {
    event.stopPropagation();
  }

  const handleText = handleForCategory(item.category);
  const handleHref = `/${locale}?kategori=${slugForCategory(item.category)}`;
  const handleClass = accentClassesFor(item.category);
  const avatarClass = avatarClassesFor(item.category);
  const categoryLabel = categoryLabels[item.category] ?? item.category;

  // Dinleme süresi tahmini (~150 kelime/dk) — sesli okuma cihazda yapılır.
  // FAZ 1.4 — rozet DOĞRULANMIŞ kaynak sayısına bağlı. Eski kayıtlarda
  // verifiedSourceCount 0 olabildiği için ham sayıya geri düşülür.
  const verifiedSources =
    item.verifiedSourceCount > 0 ? item.verifiedSourceCount : item.sourcesCount;

  // FAZ 2.2 — kartta konu etiketleri. Kategori etiketi (@ekonomi) kategori
  // satırında zaten var; yalnızca varlık etiketleri (@tcmb, @faiz) gösterilir.
  const categoryTag = `@${slugForCategory(item.category)}`;
  const entityTags = (item.tags ?? []).filter(
    (tag) => tag.startsWith("@") && tag !== categoryTag,
  );

  // NİŞ: takip edilen teknoloji varlığı veya kulüp geçiyorsa rozet göster.
  // Her teknoloji haberinde göstermek gürültü olur; yalnızca tanınan
  // varlık/kulüp eşleşmesinde gösterilir.
  const nicheMatch = matchNiche({
    title: item.title,
    summary: item.summary,
    category: item.category,
  });
  const nicheBadge =
    nicheMatch.entity ? `★ ${nicheMatch.entity}`
    : nicheMatch.club ? `◆ ${nicheMatch.club}`
    : null;

  const listenMinutes = Math.max(
    1,
    Math.round(
      `${item.title} ${item.summary}`.split(/\s+/).filter(Boolean).length / 150,
    ),
  );

  // Okundu durumu + tercih değişikliklerini izle.
  useEffect(() => {
    const sync = () => {
      setRead(isRead(`haber:${item.slug}`));
      const prefs = getPreferences();
      setReadMarksEnabled(prefs.readMarks);
      setAutoReadEnabled(prefs.autoRead);
    };

    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [item.id]);

  useEffect(() => {
    return () => {
      if (viewReportTimerRef.current) clearTimeout(viewReportTimerRef.current);
    };
  }, []);

  // 10 saniye görünür kalan kart otomatik "okundu" işaretlenir.
  // Tercih kapalıysa veya sekme arka plandaysa işaretlenmez.
  useEffect(() => {
    if (!autoReadEnabled || !readMarksEnabled || read) return;

    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;


    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible =
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.6 &&
            document.visibilityState === "visible";

          if (!visible) {
            clear();
            continue;
          }

          if (timer) continue;

          timer = setTimeout(() => {
            if (cancelled) return;
            if (!getPreferences().readMarks || !getPreferences().autoRead) return;
            markRead(`haber:${item.slug}`);
            setRead(true);
          }, 10_000);
        }
      },
      { threshold: [0, 0.6, 1] },
    );

    const onVisibility = () => {
      if (document.visibilityState !== "visible") clear();
    };

    observer.observe(el);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clear();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoReadEnabled, read, readMarksEnabled, item.slug]);

  // Görüntülenme sayacı: kart %60+ görünür ve sayfa aktifken 1 sn sonra
  // bir kez sayılır. Sayım anonimdir; IP saklanmaz.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let cancelled = false;

    const stopPending = () => {
      if (viewReportTimerRef.current) {
        clearTimeout(viewReportTimerRef.current);
        viewReportTimerRef.current = null;
      }
    };

    const report = async () => {
      if (cancelled || viewCountedRef.current) return;
      viewCountedRef.current = true;
      stopPending();

      const value = await trackView(item.id);
      if (!cancelled && typeof value === "number") setViewCount(value);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const isVisible =
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.6 &&
            document.visibilityState === "visible";

          if (!isVisible || cancelled || viewCountedRef.current) continue;

          stopPending();
          viewReportTimerRef.current = setTimeout(report, 1000);
        }
      },
      { threshold: [0, 0.6, 1] },
    );

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") stopPending();
    };

    observer.observe(el);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      stopPending();
    };
  }, [item.id]);

  const showReadState = readMarksEnabled && read;

  return (
    <article
      ref={cardRef}
      onClick={goToDetail}
      className={`group surface-card relative cursor-pointer overflow-hidden transition-[border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#31363e] hover:shadow-lg hover:shadow-black/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        showReadState ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-space-3">
        <span
          aria-hidden="true"
          className={`flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-xl border border-[#22252a] ${avatarClass}`}
        >
          <span className="truncate px-space-1 text-label font-bold">
            {item.category.slice(0, 2)}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          {/* Kategori tam görünür; saat meta satırına taşındı (tekrar yok). */}
          <div className="flex items-center gap-space-2">
            <span className={`min-w-0 truncate text-meta font-bold ${handleClass}`}>
              {handleText}
            </span>
          </div>

          <h3 className="t-h3 mt-space-2 line-clamp-2 text-zinc-100">
            <Link href={detailHref} onClick={stop} className="hover:text-zinc-300">
              <HighlightText text={item.title} query={query} />
            </Link>
          </h3>
        </div>

        <button
          type="button"
          onClick={(event) => {
            stop(event);
            onClose(item.id);
          }}
          title={cardLabels.dismiss}
          aria-label={cardLabels.dismiss}
          className="-mr-space-1 flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {item.summary ? (
        <p className="t-lead mt-space-2 text-zinc-200">
          <HighlightText text={item.summary} query={query} />
        </p>
      ) : null}

      <div className="mt-space-3 flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
        {item.isVideo ? (
          <span
            className="t-label inline-flex items-center gap-space-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-space-2 py-space-1 font-semibold text-rose-400"
            title={cardLabels.videoBadge}
          >
            <PlayIcon className="h-3 w-3" />
            {cardLabels.videoBadge}
          </span>
        ) : verifiedSources > 1 ? (
          <span
            className="t-label inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-2 py-space-1 font-semibold text-emerald-400"
            title={item.sources.join(", ")}
          >
            <CheckIcon className="h-3 w-3" />
            {cardLabels.verified.replace("{count}", String(verifiedSources))}
          </span>
        ) : (
          // TEK KAYNAK: doğrulanmadı. Sessiz geçmek yanıltıcıydı — kullanıcı
          // kaç kaynağa dayandığını her kartta görmeli.
          <span
            className="t-label inline-flex items-center gap-space-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-space-2 py-space-1 font-semibold text-amber-400"
            title={cardLabels.singleSourceHint}
          >
            <AlertTriangleIcon className="h-3 w-3" />
            {cardLabels.singleSource}
          </span>
        )}

        {showReadState ? (
          <span className="t-label rounded-full border border-[#22252a] px-space-2 py-space-1 font-medium text-zinc-400">
            {cardLabels.readLabel}
          </span>
        ) : null}

        {nicheBadge ? (
          <span
            className={`t-label inline-flex items-center rounded-full px-space-2 py-space-1 font-bold ${
              nicheMatch.entity
                ? "border border-blue-500/30 bg-blue-500/10 text-blue-300"
                : "border border-violet-500/30 bg-violet-500/10 text-violet-300"
            }`}
            title={
              nicheMatch.entity
                ? `${nicheMatch.entity} takip ediliyor`
                : `${nicheMatch.club} takip ediliyor`
            }
          >
            {nicheBadge}
          </span>
        ) : null}

        {entityTags.slice(0, 3).map((tag) => (
          <Link
            key={tag}
            href={`/${locale}/etiket/${encodeURIComponent(tag.replace(/^@/, ""))}`}
            onClick={stop}
            className="relative z-20 t-label rounded-full border border-[#22252a] bg-[#16181c] px-space-2 py-space-1 font-semibold text-zinc-400 transition hover:border-[#31363e] hover:text-zinc-200"
            title={tag}
          >
            {tag}
          </Link>
        ))}

        <span className="text-label text-zinc-500">{categoryLabel}</span>
        <span className="text-label text-zinc-600" aria-hidden="true">·</span>
        <span className="text-label text-zinc-500">
          {item.readingMinutes} dk okuma
        </span>
        <span className="text-label text-zinc-600" aria-hidden="true">·</span>
        <span className="text-label text-zinc-500">
          {cardLabels.listenLabel.replace("{minutes}", String(listenMinutes))}
        </span>
        <span className="text-label text-zinc-600" aria-hidden="true">·</span>
        <span className="text-label text-zinc-500">
          <TimeAgo date={item.createdAt} locale={locale} />
        </span>
      </div>

      {item.imageUrl ? (
        <div className="relative mt-space-4 block overflow-hidden rounded-2xl border border-[#22252a] bg-[#0e0f12]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.title || ""}
            width={1200}
            height={675}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            referrerPolicy="no-referrer"
            className="aspect-video w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          {item.isVideo && item.youtubeId ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
                <PlayIcon className="ml-space-1 h-5 w-5" />
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-space-4 flex items-center gap-space-1">
        <span
          className="flex items-center gap-space-1 rounded-full py-space-1 pr-space-2 text-meta font-medium text-zinc-500"
          title={cardLabels.views}
        >
          <EyeIcon className="h-4 w-4" />
          <span>{viewCount}</span>
        </span>

        <span className="flex-1" />

        <span onClick={stop} onKeyDown={(event) => event.stopPropagation()} className="hidden md:flex md:items-center md:gap-space-1">
          <ShareButton
            title={item.title}
            url={`/${locale}/haber/${item.slug}`}
            labels={{
              share: cardLabels.share,
              copied: cardLabels.copied,
              shareError: cardLabels.shareError,
            }}
          />
          <SaveButton
            bookmark={{
              id: item.id,
              title: item.title,
              url: `/${locale}/haber/${item.slug}`,
              category: item.category,
            }}
            labels={{ save: cardLabels.save, saved: cardLabels.saved }}
          />
        </span>

        {/* Mobilde ikincil eylemler aşamalı açığa çıkar. */}
        <details className="md:hidden" onClick={stop}>
          <summary className="flex min-h-[var(--size-touch)] cursor-pointer list-none items-center rounded-full border border-[#22252a] px-space-3 text-meta font-semibold text-zinc-400 [&::-webkit-details-marker]:hidden">
            {cardLabels.actions}
          </summary>
          <div className="mt-space-2 flex items-center gap-space-2 border-t border-[#22252a] pt-space-2">
            <ShareButton
              title={item.title}
              url={`/${locale}/haber/${item.slug}`}
              labels={{
                share: cardLabels.share,
                copied: cardLabels.copied,
                shareError: cardLabels.shareError,
              }}
            />
            <SaveButton
              bookmark={{
                id: item.id,
                title: item.title,
                url: `/${locale}/haber/${item.slug}`,
                category: item.category,
              }}
              labels={{ save: cardLabels.save, saved: cardLabels.saved }}
            />
          </div>
        </details>
      </div>
    </article>
  );
});
