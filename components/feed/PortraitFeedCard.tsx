"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, EyeIcon, SparklesIcon } from "@/components/icons";
import { SaveButton } from "@/components/SaveButton";
import { TimeAgo } from "@/components/TimeAgo";
import {
  accentClassesFor,
  avatarClassesFor,
  handleForCategory,
  slugForCategory,
} from "@/lib/categories";
import type { Locale } from "@/lib/i18n-config";
import { STORAGE_EVENT, isRead } from "@/lib/local-store";
import type { PortraitCardDto } from "@/lib/portrait-types";

type Props = {
  portrait: PortraitCardDto;
  locale: Locale;
  labels: {
    badge: string;
    verified: string;
    readingTime: string;
    listeningTime: string;
    save: string;
    saved: string;
    readLabel: string;
    actions: string;
  };
  categoryLabels: Record<string, string>;
  onClose: (id: string) => void;
  priority?: boolean;
};

/**
 * Akışa serpiştirilen portre kartı — NewsCard ile AYNI biçim; yalnızca
 * "Portre" rozeti ve kapak görseli farkı vardır. Tasarım dokusu korunur.
 */
export function PortraitFeedCard({
  portrait,
  locale,
  labels,
  categoryLabels,
  onClose,
  priority = false,
}: Props) {
  const [read, setRead] = useState(false);

  useEffect(() => {
    const sync = () => {
      setRead(isRead(`portre:${portrait.slug}`));
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [portrait.slug]);

  const href = `/${locale}/portre/${portrait.slug}`;
  const categoryLabel = categoryLabels[portrait.category] ?? portrait.category;

  return (
    <article className="group surface-card relative overflow-hidden transition-[border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#31363e] hover:shadow-lg hover:shadow-black/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="flex items-start gap-space-3">
        <span
          aria-hidden="true"
          className={`flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-xl border border-[#22252a] ${avatarClassesFor(portrait.category)}`}
        >
          <SparklesIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <span className="t-label inline-flex items-center gap-space-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-space-2 py-space-1 font-semibold text-violet-300">
              <SparklesIcon className="h-3 w-3" aria-hidden="true" />
              {labels.badge}
            </span>
            <span
              className={`truncate text-meta font-bold ${accentClassesFor(portrait.category)}`}
            >
              {handleForCategory(portrait.category)}
            </span>
          </div>

          <h3 className="t-h3 mt-space-2 line-clamp-2 text-zinc-100">
            <Link href={href} className="hover:text-zinc-300">
              {portrait.title}
            </Link>
          </h3>
        </div>

        <button
          type="button"
          onClick={() => onClose(`portre:${portrait.id}`)}
          aria-label={labels.badge}
          className="-mr-space-1 flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-full text-zinc-600 transition hover:bg-white/10 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <span aria-hidden="true" className="text-base leading-none">×</span>
        </button>
      </div>

      {portrait.subtitle ? (
        <p className="t-lead mt-space-2 line-clamp-2 text-zinc-200">
          {portrait.subtitle}
        </p>
      ) : null}

      <div className="mt-space-3 flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
        <span className="t-label inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-2 py-space-1 font-semibold text-emerald-400">
          <CheckIcon className="h-3 w-3" aria-hidden="true" />
          {labels.verified.replace("{count}", String(portrait.sourceCount))}
        </span>
        <span className="text-label text-zinc-500">{categoryLabel}</span>
        <span className="text-label text-zinc-600" aria-hidden="true">·</span>
        <span className="text-label text-zinc-500">
          {labels.readingTime.replace("{minutes}", String(portrait.readingMinutes))}
        </span>
        <span className="text-label text-zinc-600" aria-hidden="true">·</span>
        <span className="text-label text-zinc-500">
          {labels.listeningTime.replace("{minutes}", String(portrait.listenMinutes))}
        </span>
        {portrait.publishedAt ? (
          <>
            <span className="text-label text-zinc-600" aria-hidden="true">
              ·
            </span>
            <span className="text-label text-zinc-500">
              <TimeAgo date={portrait.publishedAt} locale={locale} />
            </span>
          </>
        ) : null}
      </div>

      {portrait.coverImageUrl ? (
        <Link
          href={href}
          className="mt-space-4 block overflow-hidden rounded-2xl border border-[#22252a] bg-[#0e0f12]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portrait.coverImageUrl}
            alt={portrait.title}
            width={1200}
            height={675}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="aspect-video w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </Link>
      ) : null}

      <div className="mt-space-4 flex items-center gap-space-1">
        <span className="flex items-center gap-space-1 rounded-full py-space-1 pr-space-2 text-meta font-medium text-zinc-500">
          <EyeIcon className="h-4 w-4" aria-hidden="true" />
          <span>{portrait.viewCount}</span>
        </span>
        <span className="flex-1" />
        {read ? (
          <span className="t-label rounded-full border border-[#22252a] px-space-2 py-space-1 font-medium text-zinc-400">
            {labels.readLabel}
          </span>
        ) : null}

        <span className="hidden md:flex">
          <SaveButton
            bookmark={{
              id: `portre:${portrait.slug}`,
              title: portrait.title,
              url: href,
              category: portrait.category,
            }}
            labels={{ save: labels.save, saved: labels.saved }}
          />
        </span>

        <details className="md:hidden">
          <summary className="flex min-h-[var(--size-touch)] cursor-pointer list-none items-center rounded-full border border-[#22252a] px-space-3 text-meta font-semibold text-zinc-400 [&::-webkit-details-marker]:hidden">
            {labels.actions}
          </summary>
          <div className="mt-space-2 flex items-center gap-space-2 border-t border-[#22252a] pt-space-2">
            <SaveButton
              bookmark={{
                id: `portre:${portrait.slug}`,
                title: portrait.title,
                url: href,
                category: portrait.category,
              }}
              labels={{ save: labels.save, saved: labels.saved }}
            />
          </div>
        </details>
      </div>
    </article>
  );
}
