import Link from "next/link";
import { ScrollRail } from "@/components/layout/ScrollRail";
import {
  ALL_CATEGORY_HANDLE,
  CATEGORIES,
  CATEGORY_HANDLES,
  isCategory,
} from "@/lib/categories";
import { orderForNiche } from "@/lib/niche";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  active: string;
  labels: Record<string, string>;
  ariaLabel: string;
};

/**
 * Category handle pills above the feed ("@gündem", "@teknoloji",
 * "@ekonomi", "@siyaset", "@spor", "@bilim", …).
 */
export function CategoryTabs({
  lang,
  active,
  labels,
  ariaLabel,
}: Props) {
  const hasActiveCategory = isCategory(active);

  const inactiveClass =
    "border border-[#22252a] bg-[#16181c] text-zinc-400 hover:bg-[#1d2026] hover:text-zinc-100";
  const activeClass = "bg-blue-600 text-zinc-100";

  return (
    <ScrollRail label={ariaLabel} innerClassName="gap-space-2">
      <Link
        role="tab"
        aria-selected={hasActiveCategory}
        href={`/${lang}`}
        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-space-4 py-space-2 text-sm font-medium transition ${
          hasActiveCategory ? activeClass : inactiveClass
        }`}
      >
        @{ALL_CATEGORY_HANDLE}
      </Link>

      {orderForNiche(CATEGORIES).map((category) => {
        const isActive = active === category;
        const href = `/${lang}?category=${encodeURIComponent(category)}`;

        return (
          <Link
            key={category}
            role="tab"
            aria-selected={isActive}
            href={href}
            title={labels[category] ?? category}
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-space-4 py-space-2 text-sm font-medium transition ${
              isActive ? activeClass : inactiveClass
            }`}
          >
            @{CATEGORY_HANDLES[category]}
          </Link>
        );
      })}
    </ScrollRail>
  );
}
