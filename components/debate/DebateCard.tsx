import Link from "next/link";
import { CheckIcon, ClockIcon, HeadphonesIcon, SparklesIcon } from "@/components/icons";
import { badgeClassesFor, handleForCategory } from "@/lib/categories";
import { formatDateTime } from "@/lib/datetime";
import { DEBATE_LEVEL_LABELS, type DebateLevel } from "@/lib/debate/config";
import { motionTypeLabel } from "@/lib/debate/types";
import type { DebateListItem } from "@/lib/debate/types";
import type { Locale } from "@/lib/i18n-config";

type Labels = {
  reading: string;
  listening: string;
  verified: string;
  cta: string;
};

type Props = {
  debate: DebateListItem;
  locale: Locale;
  labels: Labels;
  /** Carousel içinde sabit genişlik. */
  fixedWidth?: boolean;
};

export function levelBadgeClass(level: DebateLevel): string {
  if (level === "lise") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (level === "universite")
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

/**
 * Münazara kartı — mevcut NewsCard dokusuyla aynı: aynı yarıçap, kenarlık,
 * gölge ve boşluk. Tek fark "Portre" yerine seviye rozeti ve motion satırı.
 */
export function DebateCard({ debate, locale, labels, fixedWidth }: Props) {
  return (
    <article
      className={`group flex h-full flex-col overflow-hidden surface-card transition-all duration-300 hover:-translate-y-0.5 hover:border-[#31363e] hover:shadow-lg hover:shadow-black/40 ${
        fixedWidth ? "w-[320px] shrink-0 snap-start" : ""
      }`}
    >
      <div className="flex items-center gap-space-2">
        <span
          className={`inline-flex items-center gap-space-1 rounded-full border px-space-3 py-space-1 text-[10px] font-bold uppercase tracking-wide ${levelBadgeClass(debate.level)}`}
        >
          <SparklesIcon className="h-3 w-3" aria-hidden="true" />
          {DEBATE_LEVEL_LABELS[debate.level]}
        </span>
        <span className={`chip px-space-3 py-space-1 text-[10px] ${badgeClassesFor(debate.category)}`}>
          {debate.category}
        </span>
        <span className="rounded-full border border-[#22252a] px-space-3 py-space-1 text-[10px] font-semibold text-zinc-400">
          {motionTypeLabel(debate.motionType)}
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">
          {formatDateTime(debate.publishedAt, locale)}
        </span>
      </div>

      <h3 className="mt-space-2 line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
        <Link href={debate.href} className="focus-visible:underline">
          {debate.title}
        </Link>
      </h3>

      <p className="mt-title-spot line-clamp-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-space-3.5 py-space-2 text-[12px] font-medium leading-relaxed text-violet-100/90">
        {debate.motionText}
      </p>

      <p className="mt-space-2 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-space-1 font-semibold text-emerald-400">
          <CheckIcon className="h-3 w-3" aria-hidden="true" />
          {labels.verified.replace("{count}", String(debate.sourceCount))}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-space-1">
          <ClockIcon className="h-3 w-3" aria-hidden="true" />
          {labels.reading.replace("{minutes}", String(debate.readingMinutes))}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-space-1">
          <HeadphonesIcon className="h-3 w-3" aria-hidden="true" />
          {labels.listening.replace("{minutes}", String(debate.listenMinutes))}
        </span>
      </p>

      <div className="mt-spot-meta flex items-center justify-between gap-inline border-t border-[#22252a] pt-space-2">
        <span className="text-[10px] font-semibold text-zinc-500">
          {handleForCategory(debate.category)}
        </span>
        <Link
          href={debate.href}
          className="inline-flex min-h-[44px] items-center rounded-lg px-space-3 text-[12px] font-bold text-violet-300 transition hover:text-violet-200"
        >
          {labels.cta}
          <span aria-hidden="true" className="ml-space-1">
            →
          </span>
        </Link>
      </div>
    </article>
  );
}
