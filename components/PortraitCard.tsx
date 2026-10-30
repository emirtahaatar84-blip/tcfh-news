"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, EyeIcon, ExternalLinkIcon, SparklesIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/datetime";
import type { Locale } from "@/lib/i18n-config";
import type { PortraitCardDto } from "@/lib/portrait-types";
import { handleForCategory } from "@/lib/categories";
import { STORAGE_EVENT, getPreferences, isRead } from "@/lib/local-store";

type Labels = {
  badge: string;
  verified: string;
  readingTime: string;
  listeningTime: string;
  attributed: string;
  originalStory: string;
  person: string;
  organization: string;
  event: string;
  readLabel: string;
};

type Props = {
  portrait: PortraitCardDto;
  locale: Locale;
  labels: Labels;
  /** Ana sayfa şeridinde daha kompakt görünüm. */
  compact?: boolean;
};

/**
 * Portre kartı: kapak, "Portre" rozeti, tek cümlede özet, kaynak sayısı ve
 * "Kaynak: kantan.news" atfı. Kartın tamamı portre sayfasına gider;
 * orijinal hikâye ayrı bir bağlantıdır (yeni sekme).
 */
export function PortraitCard({ portrait, locale, labels, compact = false }: Props) {
  const [read, setRead] = useState(false);
  const [readMarksEnabled, setReadMarksEnabled] = useState(true);

  useEffect(() => {
    const sync = () => {
      setRead(isRead(`portre:${portrait.slug}`));
      setReadMarksEnabled(getPreferences().readMarks);
    };

    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [portrait.slug]);

  const showReadState = readMarksEnabled && read;
  const href = `/${locale}/portre/${portrait.slug}`;
  const typeLabel =
    portrait.subjectType === "kisi"
      ? labels.person
      : portrait.subjectType === "kurum"
        ? labels.organization
        : labels.event;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#31363e] hover:shadow-lg hover:shadow-black/40 ${
        showReadState ? "opacity-70" : ""
      }`}
    >
      {/* Tam kart bağlantısı: iç içe <a> geçersizliğini önleyen kaplama. */}
      <Link
        href={href}
        aria-label={portrait.title}
        className="absolute inset-0 z-0"
      />
      <div className="pointer-events-none relative z-10">
        {portrait.coverImageUrl ? (
          <div className={`relative w-full overflow-hidden ${compact ? "aspect-[16/8]" : "aspect-[16/9]"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait.coverImageUrl}
              alt={portrait.title}
              width={1200}
              height={675}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#16181c] via-[#16181c]/25 to-transparent"
            />

            <div className="absolute left-space-3 top-space-3 flex flex-wrap items-center gap-space-2">
              <span className="t-label inline-flex items-center gap-space-1 rounded-full border border-violet-500/30 bg-violet-500/20 px-space-2 py-space-1 font-bold text-violet-200 backdrop-blur-sm">
                <SparklesIcon className="h-3 w-3" />
                {labels.badge}
              </span>
              <span className="t-label rounded-full bg-black/50 px-space-2 py-space-1 font-semibold text-zinc-200 backdrop-blur-sm">
                {typeLabel}
              </span>
              {showReadState ? (
                <span className="t-label rounded-full bg-black/50 px-space-2 py-space-1 font-semibold text-emerald-300 backdrop-blur-sm">
                  {labels.readLabel}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-space-2 px-space-4 pt-space-4">
            <span className="t-label inline-flex items-center gap-space-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-space-2 py-space-1 font-bold text-violet-300">
              <SparklesIcon className="h-3 w-3" />
              {labels.badge}
            </span>
            <span className="t-label rounded-full border border-[#22252a] px-space-2 py-space-1 font-semibold text-zinc-400">
              {typeLabel}
            </span>
          </div>
        )}

        <div className="px-card-x py-card-y">
          <h3
            className="t-h3 line-clamp-2 text-zinc-100 transition group-hover:text-white"
          >
            {portrait.title}
          </h3>

          {portrait.subtitle ? (
            <p className="t-lead mt-space-2 line-clamp-2 text-zinc-400">
              {portrait.subtitle}
            </p>
          ) : null}

          <div className="mt-space-3 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-label text-zinc-500">
            <Link
              href={`/${locale}?category=${encodeURIComponent(portrait.category)}`}
              className="pointer-events-auto font-bold text-zinc-300 transition hover:text-zinc-100"
            >
              {handleForCategory(portrait.category)}
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              {labels.readingTime.replace("{minutes}", String(portrait.readingMinutes))}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {labels.listeningTime.replace(
                "{minutes}",
                String(portrait.listenMinutes),
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-space-1">
              <CheckIcon className="h-3 w-3 text-emerald-500" />
              {labels.verified.replace("{count}", String(portrait.sourceCount))}
            </span>
            {portrait.publishedAt ? (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={portrait.publishedAt}>
                  {formatDateTime(portrait.publishedAt, locale)}
                </time>
              </>
            ) : null}
          </div>

          <div className="mt-space-2 flex items-center gap-space-3 text-label text-zinc-600">
            <span className="inline-flex items-center gap-space-1">
              <EyeIcon className="h-3 w-3" />
              {portrait.viewCount}
            </span>
            <span>
              {labels.attributed.replace("{source}", "kantan.news")}
            </span>
          </div>
        </div>
      </div>

      {portrait.originStoryUrl ? (
        <a
          href={portrait.originStoryUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="absolute bottom-space-2 right-space-2 z-20 flex h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full bg-black/40 text-zinc-400 backdrop-blur-sm transition hover:bg-black/60 hover:text-zinc-100"
          aria-label={labels.originalStory}
          title={labels.originalStory}
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </article>
  );
}
