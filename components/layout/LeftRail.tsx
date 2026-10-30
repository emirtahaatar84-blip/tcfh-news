"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookmarkFilledIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/icons";
import { DensityControl } from "@/components/settings/DensityControl";
import {
  FEED_NAV_CATEGORIES,
  slugForCategory,
} from "@/lib/categories";
import type { Locale } from "@/lib/i18n-config";
import { STORAGE_EVENT, getBookmarks } from "@/lib/local-store";

type Props = {
  lang: Locale;
  categories: Record<string, string>;
  /** Aktif kategori slug'ı ("" = Tümü) */
  activeSlug: string;
  labels: {
    search: string;
    searchPlaceholder: string;
    categories: string;
    all: string;
    saved: string;
    debate: string;
    language: string;
    transparency: string;
    transparencyBody: string;
    density: string;
    densityGroup: string;
    densityAuto: string;
    densityReset: string;
  };
};

/**
 * Sol kolon — yalnızca >= 1180 px'te görünür ve sticky'dir.
 * Kendi içinde kaydırma alanı yoktur: sayfa kaydırmasını kilitlemez.
 */
export function LeftRail({
  lang,
  categories,
  activeSlug,
  labels,
}: Props) {
  const pathname = usePathname();
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    const sync = () => setSavedCount(getBookmarks().length);
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div className="flex flex-col gap-rail-gap pb-space-6">
      <form
        action={`/${lang}/ara`}
        method="get"
        role="search"
        className="relative"
      >
        <label htmlFor="rail-search" className="sr-only">
          {labels.search}
        </label>
        <SearchIcon
          className="pointer-events-none absolute left-space-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <input
          id="rail-search"
          type="search"
          name="q"
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          className="field pl-space-8"
        />
      </form>

      <nav aria-label={labels.categories}>
        <p className="section-label px-space-2">{labels.categories}</p>
        <ul className="mt-space-2 space-y-space-1">
          <li>
            <Link
              href={`/${lang}`}
              aria-current={activeSlug === "" ? "page" : undefined}
              className={`flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta font-semibold transition ${
                activeSlug === ""
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              {labels.all}
            </Link>
          </li>
          {FEED_NAV_CATEGORIES.map((category) => {
            const slug = slugForCategory(category);
            const active = activeSlug === slug;

            return (
              <li key={category}>
                <Link
                  href={`/${lang}?kategori=${slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta transition ${
                    active
                      ? "bg-white/10 font-semibold text-zinc-100"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {categories[category] ?? category}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-space-1 border-t border-[#22252a] pt-space-3">
        <Link
          href={`/${lang}/munazara`}
          className="flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-lg px-space-2 text-meta font-semibold text-violet-300 transition hover:bg-white/5"
        >
          <SparklesIcon className="h-4 w-4" aria-hidden="true" />
          {labels.debate}
        </Link>

        <Link
          href={`/${lang}/bookmarks`}
          className="flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-lg px-space-2 text-meta text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
        >
          <BookmarkFilledIcon className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1">{labels.saved}</span>
          <span className="rounded-full bg-[#22252a] px-space-1 text-label font-bold text-zinc-300">
            {savedCount > 99 ? "99+" : savedCount}
          </span>
        </Link>

        <div className="flex items-center gap-space-1 px-space-2 pt-space-1">
          <span className="section-label">{labels.language}</span>
          {(["tr", "en"] as const).map((code) => (
            <Link
              key={code}
              href={`/${code}${pathname?.replace(/^\/(tr|en)/, "") ?? ""}`}
              hrefLang={code === "tr" ? "tr-TR" : "en"}
              aria-current={lang === code ? "page" : undefined}
              className={`inline-flex min-h-[var(--size-touch)] items-center rounded-full px-space-2 text-label font-bold transition ${
                lang === code
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {code.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      <DensityControl
        label={labels.density}
        groupLabel={labels.densityGroup}
        autoLabel={labels.densityAuto}
        resetLabel={labels.densityReset}
      />

      <p className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-2 text-meta text-zinc-500">
        <span className="section-label block text-zinc-400">
          {labels.transparency}
        </span>
        {labels.transparencyBody}
      </p>
    </div>
  );
}
