import Link from "next/link";
import { ScrollRail } from "@/components/layout/ScrollRail";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  tags: string[];
  ariaLabel: string;
};

/**
 * Horizontal topic bubbles bar (live-site style "sub-topics" row):
 * small `rounded-full bg-[#22252a] border border-[#22252a]` chips.
 */
export function SubTopicsBar({ lang, tags, ariaLabel }: Props) {
  if (tags.length === 0) return null;

  return (
    <ScrollRail label={ariaLabel} innerClassName="gap-space-2">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/${lang}?q=${encodeURIComponent(tag)}`}
          title={`#${tag}`}
          className="inline-flex shrink-0 items-center gap-space-2 rounded-full border border-[#22252a] bg-[#22252a] px-space-3 py-space-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
          {tag}
        </Link>
      ))}
    </ScrollRail>
  );
}
