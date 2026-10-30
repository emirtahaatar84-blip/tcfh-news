"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useRouter } from "next/navigation";
import { LoaderIcon, SearchIcon, XIcon } from "@/components/icons";
import { HighlightText } from "@/components/HighlightText";
import { TimeAgo } from "@/components/TimeAgo";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from "@/lib/local-store";
import type { Locale } from "@/lib/i18n-config";

type SearchResult = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  sources: string[];
  createdAt: string;
};

type Props = {
  lang: Locale;
  /** Üst menüdeki arama düğmesi varsa kendi tetikleyicisini gizle. */
  renderTrigger?: boolean;
  labels: {
    open: string;
    placeholder: string;
    recent: string;
    noResults: string;
    hint: string;
    clearRecent: string;
    results: string;
    close: string;
  };
};

/**
 * Komut paleti (⌘K / Ctrl+K). Başlık + spot içinde anlık arama yapar
 * (300 ms debounce). Son aramalar yalnızca cihazda tutulur; sorgu
 * sunucuda saklanmaz.
 *
 * Klavye: ↑/↓ gezinme, Enter açma, Esc kapatma.
 */
export function CommandPalette({ lang, labels, renderTrigger = true }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useFocusTrap(dialogRef, open);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setItems([]);
    setTouched(false);
    setActiveIndex(0);
  }, []);

  // Global kısayol: ⌘K / Ctrl+K. Metin alanına odaklıyken tetiklenmez.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (typing) return;
        event.preventDefault();
        setRecent(getRecentSearches());
        setOpen((value) => !value);
        return;
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };

    // Mobil üst çubuk bu olayı yayar.
    const onOpenEvent = () => {
      setRecent(getRecentSearches());
      setOpen(true);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("eth:open-search", onOpenEvent);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("eth:open-search", onOpenEvent);
    };
  }, [close, open]);

  useEffect(() => {
    if (open) {
      setRecent(getRecentSearches());
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounce'lu arama.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = term.trim();

    if (query.length < 2) {
      setItems([]);
      setLoading(false);
      setTouched(false);
      return;
    }

    setLoading(true);
    setTouched(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );

        if (!response.ok) throw new Error("search failed");

        const data = (await response.json()) as { items: SearchResult[] };
        setItems(data.items);
        setActiveIndex(0);
        setRecent(addRecentSearch(query));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [term]);

  function goTo(result: SearchResult) {
    addRecentSearch(term.trim());
    close();
    router.push(`/${lang}/haber/${result.slug}`);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const result = items[activeIndex];
      if (result) {
        event.preventDefault();
        goTo(result);
      }
    }
  }

  return (
    <>
      {renderTrigger ? (
        <button
        type="button"
        onClick={() => {
          setRecent(getRecentSearches());
          setOpen(true);
        }}
        aria-label={labels.open}
        className="flex w-full items-center gap-space-3 rounded-full border border-[#22252a] bg-[#16181c] py-space-3 pl-space-6 pr-space-8 text-left text-sm text-zinc-500 transition hover:border-[#31363e] hover:text-zinc-400"
      >
        <SearchIcon className="pointer-events-none absolute ml-space-3 h-4 w-4" />
        <span className="ml-space-0">{labels.placeholder}</span>
        <kbd className="absolute right-3 hidden rounded border border-[#22252a] bg-[#0e0f12] px-space-2 py-space-1 text-[10px] font-semibold text-zinc-500 sm:block">
          ⌘K
        </kbd>
        </button>

      ) : null}

      {open && mounted
        ? createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={labels.open}
          className="fixed inset-0 z-[60] flex items-start justify-center px-space-4 pt-[12vh]"
        >
          <button
            type="button"
            aria-label={labels.close}
            onClick={close}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            tabIndex={-1}
          />

          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c] shadow-2xl">
            <div className="flex items-center gap-space-2 border-b border-[#22252a] px-space-4">
              <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                ref={inputRef}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                className="h-13 min-h-[52px] w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                autoComplete="off"
                spellCheck={false}
              />
              {loading ? (
                <LoaderIcon className="h-4 w-4 animate-spin text-zinc-500" />
              ) : (
                <button
                  type="button"
                  onClick={close}
                  aria-label={labels.close}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {term.trim().length < 2 ? (
                <div className="p-space-3">
                  <div className="flex items-center justify-between px-space-2 pb-space-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      {labels.recent}
                    </p>
                    {recent.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecent([]);
                        }}
                        className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
                      >
                        {labels.clearRecent}
                      </button>
                    ) : null}
                  </div>

                  {recent.length === 0 ? (
                    <p className="px-space-2 py-space-5 text-center text-xs text-zinc-500">
                      {labels.hint}
                    </p>
                  ) : (
                    <ul>
                      {recent.map((entry) => (
                        <li key={entry}>
                          <button
                            type="button"
                            onClick={() => setTerm(entry)}
                            className="flex w-full items-center gap-space-2 rounded-xl px-space-3 py-space-3 text-left text-sm text-zinc-300 transition hover:bg-white/5"
                          >
                            <SearchIcon className="h-3.5 w-3.5 text-zinc-500" />
                            {entry}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : items.length === 0 && touched && !loading ? (
                <div className="px-space-4 py-space-7 text-center">
                  <p className="text-sm font-medium text-zinc-300">
                    {labels.noResults}
                  </p>
                  <p className="mt-space-1 text-xs text-zinc-500">{labels.hint}</p>
                </div>
              ) : (
                <ul aria-label={labels.results}>
                  {items.map((result, index) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goTo(result)}
                        className={`flex w-full items-start gap-space-3 px-space-4 py-space-3 text-left transition ${
                          index === activeIndex ? "bg-white/5" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-snug text-zinc-100">
                            <HighlightText text={result.title} query={term} />
                          </span>
                          <span className="mt-space-1 block truncate text-xs text-zinc-500">
                            {result.category} ·{" "}
                            <TimeAgo date={result.createdAt} locale={lang} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#22252a] px-space-4 py-space-2 text-[10px] text-zinc-500">
              <span>↑ ↓ · Enter · Esc</span>
              <span>Tercihler yalnızca bu cihazda saklanır.</span>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
