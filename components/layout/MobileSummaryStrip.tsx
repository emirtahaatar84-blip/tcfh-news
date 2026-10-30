import Link from "next/link";
import { ChevronRightIcon, SparklesIcon } from "@/components/icons";
import type { RailItem } from "@/components/layout/rail-types";

type Props = {
  items: RailItem[];
  title: string;
  hint: string;
};

/**
 * Mobil özet şeridi (< 768 px): sağ kolonun "Günün özeti" içeriğini
 * akışın en üstüne taşır. Kapalı başlar; ilk ekranda tek birincil eylem
 * (akışı okumak) görünür. Tek dokunuşla açılır, JS gerektirmez.
 */
export function MobileSummaryStrip({ items, title, hint }: Props) {
  if (items.length === 0) return null;

  return (
    <details className="surface-card group/mobile-summary md:hidden">
      <summary className="flex min-h-[var(--size-touch)] cursor-pointer list-none items-center gap-space-2 p-space-0 [&::-webkit-details-marker]:hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <SparklesIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-label text-violet-300">{title}</span>
          <span className="mt-space-1 block text-meta text-zinc-500">{hint}</span>
        </span>
        <ChevronRightIcon
          className="h-4 w-4 shrink-0 rotate-90 text-zinc-500 transition-transform group-open/mobile-summary:-rotate-90"
          aria-hidden="true"
        />
      </summary>

      <ol className="mt-space-3 space-y-space-2 border-t border-[#22252a] pt-space-3">
        {items.map((item, index) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-[var(--size-touch)] items-start gap-space-2 rounded-lg py-space-1 transition hover:bg-white/5"
            >
              <span
                aria-hidden="true"
                className="mt-space-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-label text-violet-300"
              >
                {index + 1}
              </span>
              <span className="line-clamp-2 text-meta font-semibold text-zinc-200">
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </details>
  );
}
