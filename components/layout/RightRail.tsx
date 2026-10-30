import Link from "next/link";
import { NewsRadio } from "@/components/NewsRadio";
import { PortraitCard } from "@/components/PortraitCard";
import { TimeAgo } from "@/components/TimeAgo";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import type { RailItem } from "@/components/layout/rail-types";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem } from "@/lib/news-types";
import type { PortraitCardDto } from "@/lib/portrait-types";

type Props = {
  lang: Locale;
  summary: RailItem[];
  important: RailItem[];
  portraits: PortraitCardDto[];
  radioItems: FeedNewsItem[];
  dict: Dictionary;
};

/**
 * Sağ kolon — 768-1179 px'te akışın ALTINDA iki kolonlu widget ızgarası,
 * >= 1180 px'te sticky. İçinde sonsuz yükleme ve kendi kaydırma alanı
 * yoktur (scroll trap oluşmaz). Tüm veriler sunucuda hazırlanır.
 */
export function RightRail({
  lang,
  summary,
  important,
  portraits,
  radioItems,
  dict,
}: Props) {
  return (
    <div className="grid gap-card-gap pb-space-6 md:grid-cols-2 md:items-start 3col:grid-cols-1">
      <section
        aria-labelledby="rail-summary"
        className="surface-card"
      >
        <div className="flex items-center justify-between gap-space-2">
          <h2 id="rail-summary" className="section-label text-violet-300">
            {dict.home.todaySummary}
          </h2>
          <span className="text-label text-zinc-600">
            {summary.length} {lang === "tr" ? "madde" : "items"}
          </span>
        </div>

        {summary.length === 0 ? (
          <p className="mt-space-2 text-meta text-zinc-500">{dict.home.empty}</p>
        ) : (
          <ol className="section-body space-y-space-2">
            {summary.map((item, index) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex min-h-[var(--size-touch)] items-start gap-space-2 rounded-lg py-space-1 transition hover:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className="mt-space-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-label font-bold text-violet-300"
                  >
                    {index + 1}
                  </span>
                  <span className="line-clamp-2 text-meta font-semibold text-zinc-200 group-hover:text-zinc-50">
                    {item.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {important.length > 0 ? (
        <section aria-labelledby="rail-important">
          <h2
            id="rail-important"
            className="section-label flex items-center gap-space-1 text-zinc-400"
          >
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-rose-500" />
            {dict.home.nowImportant}
          </h2>
          <ul className="section-body space-y-space-2">
            {important.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group surface-card block transition hover:border-[#31363e]"
                >
                  <span className="inline-flex rounded-full border border-[#22252a] px-space-2 py-space-1 text-label font-bold text-zinc-500">
                    {item.badge}
                  </span>
                  <span className="mt-space-2 line-clamp-2 block text-meta font-semibold text-zinc-200 group-hover:text-zinc-50">
                    {item.title}
                  </span>
                  {item.when ? (
                    <span className="mt-space-1 block text-label text-zinc-500">
                      <TimeAgo date={item.when} locale={lang} />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portraits.length > 0 ? (
        <section aria-labelledby="rail-portraits">
          <div className="flex items-center justify-between gap-space-2">
            <h2 id="rail-portraits" className="section-label text-zinc-400">
              {dict.home.latestPortraits}
            </h2>
            <Link
              href={`/${lang}/portreler`}
              className="inline-flex min-h-[var(--size-touch)] items-center text-label font-semibold text-violet-400 hover:text-violet-300"
            >
              {dict.home.allPortraits}
              <ChevronRightIcon className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <ul className="section-body space-y-space-3">
            {portraits.slice(0, 3).map((portrait) => (
              <li key={portrait.id}>
                <PortraitCard
                  portrait={portrait}
                  locale={lang}
                  labels={dict.portraits.card}
                  compact
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rail-radio" className="surface-card">
        <h2 id="rail-radio" className="section-label text-zinc-400">
          {dict.feed.radio}
        </h2>
        <p className="mt-space-1 text-label text-zinc-500">
          {dict.feed.radioHint}
        </p>
        <div className="mt-space-3">
          <NewsRadio
            lang={lang}
            items={radioItems}
            labels={{
              radio: dict.feed.radio,
              radioNow: dict.feed.radioNow,
              radioEnd: dict.feed.radioEnd,
              radioError: dict.feed.radioError,
            }}
          />
        </div>
      </section>

      <p className="rounded-2xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-label text-zinc-500">
        <span className="mb-space-1 flex items-center gap-space-1 font-bold text-emerald-400">
          <CheckIcon className="h-3 w-3" aria-hidden="true" />
          {dict.shell.transparency}
        </span>
        {dict.shell.transparencyBody}
      </p>
    </div>
  );
}
