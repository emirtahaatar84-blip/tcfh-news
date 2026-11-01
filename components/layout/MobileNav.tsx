"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookmarkFilledIcon,
  CompassIcon,
  QuoteIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/icons";
import { useEffect, useState } from "react";
import { STORAGE_EVENT, getBookmarks } from "@/lib/local-store";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  labels: {
    feed: string;
    categories: string;
    search: string;
    saved: string;
    savedShort: string;
    debate: string;
  };
};

/**
 * Mobil alt sabit menü: Akış · Kategoriler · Ara · Kaydedilenler.
 * Dokunma hedefleri 44 px; aktif öğe aria-current ile işaretlenir.
 */
export function MobileNav({ lang, labels }: Props) {
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

  const items = [
    { key: "feed", href: `/${lang}`, label: labels.feed, Icon: SparklesIcon },
    {
      key: "categories",
      href: `/${lang}/kategoriler`,
      label: labels.categories,
      Icon: CompassIcon,
    },
    { key: "search", href: `/${lang}/ara`, label: labels.search, Icon: SearchIcon },
    {
      key: "debate",
      href: `/${lang}/munazara`,
      label: labels.debate,
      Icon: QuoteIcon,
    },
    {
      key: "saved",
      href: `/${lang}/bookmarks`,
      /* Görünen etiket kısa; erişilebilir ad tam ("Kaydedilenler"). */
      label: labels.savedShort,
      ariaLabel: labels.saved,
      Icon: BookmarkFilledIcon,
    },
  ];

  const active = (href: string) =>
    href === `/${lang}` ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label={labels.feed}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#22252a] bg-[#0e0f12]/97 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive = active(item.href);

          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={"ariaLabel" in item ? item.ariaLabel : item.label}
                className={`flex min-h-[var(--size-bottom-nav)] min-w-0 flex-col items-center justify-center gap-space-1 overflow-hidden px-space-0 text-label transition-colors ${
                  isActive ? "text-blue-400" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="relative">
                  <item.Icon className="h-5 w-5" />
                  {item.key === "saved" && savedCount > 0 ? (
                    <span className="absolute -right-space-2 -top-space-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-space-1 text-[10px] font-bold text-white">
                      {savedCount > 99 ? "99+" : savedCount}
                    </span>
                  ) : null}
                </span>
                <span className="block w-full max-w-full truncate text-center">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
