"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookmarkFilledIcon,
  ChevronRightIcon,
  SearchIcon,
  SettingsIcon,
} from "@/components/icons";
import { DensityMenu } from "@/components/layout/DensityMenu";
import { SiteLogo } from "@/components/SiteLogo";
import { ThemeCycleButton } from "@/components/ThemeCycleButton";
import { CATEGORIES } from "@/lib/categories";
import type { Locale } from "@/lib/i18n-config";
import { STORAGE_EVENT, getBookmarks } from "@/lib/local-store";

type Labels = {
  feed: string;
  categories: string;
  portraits: string;
  news: string;
  podcast: string;
  blog: string;
  search: string;
  saved: string;
  debate: string;
  admin: string;
  theme: { system: string; light: string; dark: string };
  density: {
    density: string;
    densityGroup: string;
    densityHint: string;
    densityAuto: string;
    densityResetAuto: string;
    densityCompactHint: string;
    densityBalancedHint: string;
    densityComfortableHint: string;
  };
};

type Props = {
  lang: Locale;
  siteName: string;
  labels: Labels;
  showAdminLink: boolean;
};

/**
 * Üst menü + mobil başlık. Masaüstünde yatay menü (Kategoriler açılır),
 * mobilde kompakt başlık. Kaydedilenler sayacı yalnızca cihazdan okunur.
 *
 * Çentik/durum çubuğu için üst safe-area inset'i header yüksekliğine eklenir.
 * Yoğunluk seçici her genişlikte erişilebilir kalır.
 */
export function SiteHeader({ lang, siteName, labels, showAdminLink }: Props) {
  const pathname = usePathname();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setCategoriesOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!categoriesOpen) return;

    const onDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setCategoriesOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoriesOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [categoriesOpen]);

  const isActive = (href: string) =>
    href === `/${lang}` ? pathname === href : pathname.startsWith(href);

  const navItems = [
    { href: `/${lang}`, label: labels.feed },
    { href: `/${lang}/portreler`, label: labels.portraits },
    { href: `/${lang}/haberler`, label: labels.news },
    { href: `/${lang}/podcast`, label: labels.podcast },
    { href: `/${lang}/blog`, label: labels.blog },
  ];

  return (
    <header
      className="sticky top-0 z-40 border-b border-[#22252a] bg-[#0e0f12]/95 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="page-x mx-auto flex h-[var(--size-header)] max-w-[var(--layout-max)] items-center gap-space-2">
        <Link
          href={`/${lang}`}
          className="group flex min-h-[var(--size-touch)] min-w-0 shrink-0 items-center gap-space-1"
          aria-label={siteName}
        >
          <span
            aria-hidden="true"
            className="h-6 w-[3px] shrink-0 rounded-full bg-white transition group-hover:bg-zinc-400"
          />
          <SiteLogo siteName={siteName} className="text-meta" />
        </Link>

        {/* Masaüstü menü */}
        <nav
          aria-label={labels.feed}
          className="ml-space-2 hidden items-center gap-space-1 md:flex"
        >
          <Link
            href={`/${lang}`}
            aria-current={isActive(`/${lang}`) ? "page" : undefined}
            className={`flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta font-semibold transition ${
              isActive(`/${lang}`)
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {labels.feed}
          </Link>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setCategoriesOpen((value) => !value)}
              aria-expanded={categoriesOpen}
              aria-haspopup="true"
              className="flex min-h-[var(--size-touch)] items-center gap-space-1 rounded-lg px-space-2 text-meta font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              {labels.categories}
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform ${
                  categoriesOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {categoriesOpen ? (
              <div
                role="menu"
                aria-label={labels.categories}
                className="absolute left-0 top-full z-50 mt-space-1 w-56 rounded-xl border border-[#22252a] bg-[#16181c] p-space-1 shadow-2xl"
              >
                <Link
                  href={`/${lang}/kategoriler`}
                  role="menuitem"
                  className="flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta font-semibold text-zinc-200 transition hover:bg-white/5"
                >
                  {labels.categories}
                </Link>
                <div className="my-space-1 h-px bg-[#22252a]" />
                <Link
                  href={`/${lang}/munazara`}
                  role="menuitem"
                  className="flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta font-semibold text-violet-300 transition hover:bg-white/5"
                >
                  {labels.debate}
                </Link>
                <div className="my-space-1 h-px bg-[#22252a]" />
                {CATEGORIES.map((category) => (
                  <Link
                    key={category}
                    href={`/${lang}/kategori/${encodeURIComponent(category)}`}
                    role="menuitem"
                    className="flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
                  >
                    {category}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {navItems.slice(1).map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              data-secondary={index >= 2 ? "true" : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex min-h-[var(--size-touch)] items-center rounded-lg px-space-2 text-meta font-semibold transition ${
                index >= 2 ? "hidden lg:flex" : "flex"
              } ${
                isActive(item.href)
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-space-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("eth:open-search"))}
            aria-label={labels.search}
            title={labels.search}
            className="hidden h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 sm:flex"
          >
            <SearchIcon className="h-[18px] w-[18px]" />
          </button>

          <Link
            href={`/${lang}/bookmarks`}
            aria-label={`${labels.saved} (${savedCount})`}
            title={`${labels.saved} (${savedCount})`}
            className="relative hidden h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 sm:flex"
          >
            <BookmarkFilledIcon className="h-[18px] w-[18px]" />
            {savedCount > 0 ? (
              <span className="absolute right-space-1 top-space-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-space-1 text-[10px] font-bold text-white">
                {savedCount > 99 ? "99+" : savedCount}
              </span>
            ) : null}
          </Link>

          <DensityMenu labels={labels.density} />
          <ThemeCycleButton labels={labels.theme} />

          {showAdminLink ? (
            <Link
              href={`/${lang}/admin`}
              aria-label={labels.admin}
              title={labels.admin}
              className="hidden h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100 sm:flex"
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
