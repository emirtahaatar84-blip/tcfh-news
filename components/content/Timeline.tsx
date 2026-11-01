"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * FAZ 3.1 (frontend) — Dikey zaman çizelgesi.
 *
 * Etiket sayfasında ve haber detayında kullanılır. Veri sunucudan prop
 * olarak gelir (SSR); "şu ana kadar ne oldu" özeti üstte gösterilir.
 *
 * Çerez yok; kişisel veri yok.
 */

type TimelineItem = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
};

type Props = {
  items: TimelineItem[];
  digest: string;
  locale: string;
  labels: {
    heading: string;
    digestTitle: string;
    digestUpdated: string;
    empty: string;
  };
};

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

export function Timeline({ items, digest, locale, labels }: Props) {
  // İstemci tarafı saat kaymasını önlemek için tarihler ilk render'da sabit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (items.length === 0) {
    return (
      <p className="mt-space-4 rounded-2xl border border-dashed border-[#22252a] px-space-4 py-space-6 text-center text-sm text-zinc-500">
        {labels.empty}
      </p>
    );
  }

  // Tarih sırası: yeniden eskiye (en güncel üstte).
  const ordered = [...items].reverse();

  return (
    <section aria-labelledby="timeline-title" className="mt-space-5">
      <h2 id="timeline-title" className="section-title mb-space-3">
        {labels.heading}
      </h2>

      {digest ? (
        <div className="mb-space-4 rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {labels.digestTitle}
          </p>
          <p className="mt-space-2 text-[13px] leading-relaxed text-zinc-300">
            {digest}
          </p>
        </div>
      ) : null}

      <ol className="relative ml-space-2 border-l border-[#22252a] pl-space-4">
        {ordered.map((item, index) => {
          const href = item.slug ? `/${locale}/haber/${item.slug}` : null;
          const isLatest = index === 0;

          return (
            <li key={item.id} className="relative pb-space-4 last:pb-0">
              {/* Nokta */}
              <span
                aria-hidden="true"
                className={`absolute -left-[calc(var(--space-4)+5px)] top-space-2 h-2.5 w-2.5 rounded-full border-2 ${
                  isLatest
                    ? "border-blue-400 bg-blue-500"
                    : "border-[#31363e] bg-[#0e0f12]"
                }`}
              />

              <time
                dateTime={item.createdAt}
                className="block text-[11px] font-semibold text-zinc-500"
              >
                {mounted ? formatDate(item.createdAt, locale) : item.createdAt.slice(0, 10)}
              </time>

              {href ? (
                <Link
                  href={href}
                  className="mt-space-1 block text-[13px] font-semibold leading-snug text-zinc-200 hover:text-zinc-50"
                >
                  {item.title}
                </Link>
              ) : (
                <span className="mt-space-1 block text-[13px] font-semibold leading-snug text-zinc-200">
                  {item.title}
                </span>
              )}

              <p className="mt-space-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                {item.summary}
              </p>

              <span className="mt-space-1 inline-block t-label text-zinc-600">
                {item.category}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
