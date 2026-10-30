"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  FilterIcon,
  LoaderIcon,
  XIcon,
} from "@/components/icons";
import {
  DATE_RANGES,
  READING_TIMES,
  filtersToSearchParams,
  type DateRange,
  type FeedFilters,
  type ReadingTime,
} from "@/lib/news-query";
import type { Locale } from "@/lib/i18n-config";

export type FilterLabels = {
  title: string;
  open: string;
  close: string;
  category: string;
  dateRange: string;
  source: string;
  readingTime: string;
  today: string;
  week: string;
  month: string;
  all: string;
  short: string;
  medium: string;
  long: string;
  apply: string;
  reset: string;
  resultCount: string;
  clearAll: string;
  activeFilters: string;
  noSources: string;
};

type Props = {
  lang: Locale;
  filters: FeedFilters;
  categories: readonly string[];
  categoryLabels: Record<string, string>;
  sources: string[];
  labels: FilterLabels;
};

const RANGE_ORDER: readonly DateRange[] = DATE_RANGES;
const TIME_ORDER: readonly ReadingTime[] = READING_TIMES;

/**
 * Gelişmiş filtre paneli: kategori (çoklu), tarih aralığı, kaynak ve
 * okuma süresi. Tüm seçimler URL query parametrelerine yazılır — bağlantı
 * paylaşılabilir, geri tuşu ve yer işareti doğru çalışır.
 *
 * Erişilebilirlik: aria-expanded, role=dialog, Esc ile kapanma, ilk
 * öğeye odak, seçimlerde aria-pressed.
 */
export function FilterPanel({
  lang,
  filters,
  categories,
  categoryLabels,
  sources,
  labels,
}: Props) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FeedFilters>(filters);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useFocusTrap(panelRef, open);

  const activeCount =
    filters.categories.length +
    filters.sources.length +
    (filters.readingTime ? 1 : 0) +
    (filters.dateRange !== "all" ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setPending(filters);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, filters]);

  const apply = useCallback(
    (next: FeedFilters) => {
      setBusy(true);
      const query = filtersToSearchParams(next).toString();
      router.push(query ? `/${lang}?${query}` : `/${lang}`, {
        scroll: false,
      });
      setOpen(false);
      window.setTimeout(() => setBusy(false), 400);
    },
    [lang, router],
  );

  function toggleCategory(category: string) {
    setPending((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  }

  function toggleSource(source: string) {
    setPending((current) => ({
      ...current,
      sources: current.sources.includes(source)
        ? current.sources.filter((item) => item !== source)
        : [...current.sources, source],
    }));
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={labels.open}
        title={labels.open}
        className={`touch-target relative flex shrink-0 items-center justify-center gap-space-2 rounded-full border px-space-3 py-space-2 text-xs font-semibold transition ${
          activeCount > 0
            ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
            : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:bg-[#1d2026] hover:text-zinc-100"
        }`}
      >
        {busy ? (
          <LoaderIcon className="h-4 w-4 animate-spin" />
        ) : (
          <FilterIcon className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{labels.title}</span>
        {activeCount > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-space-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open && mounted
        ? createPortal(
        <>
          <button
            type="button"
            aria-label={labels.close}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm"
            tabIndex={-1}
          />

          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={labels.title}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[#22252a] bg-[#16181c] p-space-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[380px] sm:rounded-2xl"
          >
            <div className="mb-space-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-100">{labels.title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={labels.close}
                className="touch-target flex items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <FilterSection title={labels.category}>
              {categories.map((category) => (
                <Chip
                  key={category}
                  active={pending.categories.includes(category)}
                  onClick={() => toggleCategory(category)}
                >
                  {categoryLabels[category] ?? category}
                </Chip>
              ))}
            </FilterSection>

            <FilterSection title={labels.dateRange}>
              {RANGE_ORDER.map((range) => (
                <Chip
                  key={range}
                  active={pending.dateRange === range}
                  onClick={() =>
                    setPending((current) => ({ ...current, dateRange: range }))
                  }
                >
                  {range === "today"
                    ? labels.today
                    : range === "week"
                      ? labels.week
                      : range === "month"
                        ? labels.month
                        : labels.all}
                </Chip>
              ))}
            </FilterSection>

            <FilterSection title={labels.readingTime}>
              {TIME_ORDER.map((time) => (
                <Chip
                  key={time}
                  active={pending.readingTime === time}
                  onClick={() =>
                    setPending((current) => ({
                      ...current,
                      readingTime: current.readingTime === time ? null : time,
                    }))
                  }
                >
                  {time === "short"
                    ? labels.short
                    : time === "medium"
                      ? labels.medium
                      : labels.long}
                </Chip>
              ))}
            </FilterSection>

            <FilterSection title={labels.source}>
              {sources.length === 0 ? (
                <p className="text-xs text-zinc-500">{labels.noSources}</p>
              ) : (
                sources.map((source) => (
                  <Chip
                    key={source}
                    active={pending.sources.includes(source)}
                    onClick={() => toggleSource(source)}
                  >
                    {source}
                  </Chip>
                ))
              )}
            </FilterSection>

            <div className="mt-space-5 flex items-center gap-space-2 border-t border-[#22252a] pt-space-4">
              <button
                type="button"
                onClick={() =>
                  setPending({
                    ...pending,
                    categories: [],
                    dateRange: "all",
                    sources: [],
                    readingTime: null,
                  })
                }
                className="btn-secondary flex-1"
              >
                {labels.reset}
              </button>
              <button
                type="button"
                onClick={() => apply(pending)}
                className="btn-primary flex-1"
              >
                <CheckIcon className="h-4 w-4" />
                {labels.apply}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )
        : null}
    </>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-space-4">
      <legend className="mb-space-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
        {title}
      </legend>
      <div className="flex flex-wrap gap-space-2">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[36px] items-center gap-space-2 rounded-full border px-space-3 text-xs font-semibold transition ${
        active
          ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
          : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:border-[#31363e] hover:text-zinc-100"
      }`}
    >
      {active ? <CheckIcon className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}
