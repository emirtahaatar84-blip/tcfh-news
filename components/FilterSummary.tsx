"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XIcon } from "@/components/icons";
import {
  filtersToSearchParams,
  type FeedFilters,
} from "@/lib/news-query";
import type { FilterLabels } from "@/components/FilterPanel";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  filters: FeedFilters;
  total: number | null;
  categoryLabels: Record<string, string>;
  labels: FilterLabels;
};

/**
 * Aktif filtre çipleri + sonuç sayısı. Her çip tek tıkla kaldırılır;
 * değişiklik URL'e yazılır (geri tuşu çalışır).
 */
export function FilterSummary({
  lang,
  filters,
  total,
  categoryLabels,
  labels,
}: Props) {
  const router = useRouter();

  const go = useCallback(
    (next: FeedFilters) => {
      const query = filtersToSearchParams(next).toString();
      router.push(query ? `/${lang}?${query}` : `/${lang}`, {
        scroll: false,
      });
    },
    [lang, router],
  );

  const chips: { key: string; label: string; remove: () => void }[] = [];

  for (const category of filters.categories) {
    chips.push({
      key: `category-${category}`,
      label: categoryLabels[category] ?? category,
      remove: () =>
        go({
          ...filters,
          categories: filters.categories.filter((item) => item !== category),
        }),
    });
  }

  if (filters.dateRange !== "all") {
    const rangeLabel =
      filters.dateRange === "today"
        ? labels.today
        : filters.dateRange === "week"
          ? labels.week
          : labels.month;

    chips.push({
      key: "range",
      label: rangeLabel,
      remove: () => go({ ...filters, dateRange: "all" }),
    });
  }

  if (filters.readingTime) {
    const timeLabel =
      filters.readingTime === "short"
        ? labels.short
        : filters.readingTime === "medium"
          ? labels.medium
          : labels.long;

    chips.push({
      key: "time",
      label: timeLabel,
      remove: () => go({ ...filters, readingTime: null }),
    });
  }

  for (const source of filters.sources) {
    chips.push({
      key: `source-${source}`,
      label: source,
      remove: () =>
        go({
          ...filters,
          sources: filters.sources.filter((item) => item !== source),
        }),
    });
  }

  if (filters.query) {
    chips.push({
      key: "query",
      label: `“${filters.query}”`,
      remove: () => go({ ...filters, query: null }),
    });
  }

  return (
    <div className="border-b border-[#22252a] px-space-3 py-space-3 sm:px-space-5">
      <div className="flex items-center justify-between gap-space-3">
        <p aria-live="polite" className="text-xs font-medium text-zinc-500">
          {labels.resultCount.replace("{count}", String(total ?? 0))}
        </p>
        <Link
          href={`/${lang}`}
          className="shrink-0 text-xs font-semibold text-blue-500 transition hover:text-blue-400"
        >
          {labels.clearAll}
        </Link>
      </div>

      {chips.length > 0 ? (
        <ul
          aria-label={labels.activeFilters}
          className="scrollbar-hide mt-space-2 flex gap-space-2 overflow-x-auto pb-space-1"
        >
          {chips.map((chip) => (
            <li key={chip.key} className="shrink-0">
              <button
                type="button"
                onClick={chip.remove}
                className="inline-flex min-h-[32px] items-center gap-space-2 rounded-full border border-[#22252a] bg-[#22252a] px-space-3 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label={`${chip.label} — kaldır`}
              >
                {chip.label}
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
