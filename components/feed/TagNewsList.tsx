"use client";

import { useState } from "react";
import { NewsCard } from "@/components/NewsCard";
import type { FeedNewsItem } from "@/lib/news-types";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";

/**
 * FAZ 2.3 (etiket sayfası) — kart listesi sarmalayıcısı.
 *
 * NEDEN ayrı bileşen: `NewsCard` bir client component ve `onClose` olay
 * işleyicisi ister. Sunucu bileşeninden fonksiyon geçirilemez
 * ("Event handlers cannot be passed to Client Component props").
 * Bu sarmalayıcı, sunucudan gelen saf veriyi alır; kapatma durumunu
 * istemcide yönetir (oturum bazlı, kalıcı değil).
 */
export function TagNewsList({
  items,
  locale,
  dict,
}: {
  items: FeedNewsItem[];
  locale: Locale;
  dict: Dictionary;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = items.filter((item) => !dismissed.has(item.id));

  if (visible.length === 0) {
    return (
      <p className="mt-space-6 rounded-2xl border border-dashed border-[#22252a] px-space-4 py-space-7 text-center text-sm text-zinc-500">
        {dict.compare.empty}
      </p>
    );
  }

  return (
    <ul className="mt-space-4 space-y-space-3">
      {visible.map((item) => (
        <li key={item.id} className="feed-item">
          <NewsCard
            item={item}
            locale={locale}
            cardLabels={dict.card}
            categoryLabels={dict.categories}
            bookmarksMode={false}
            onClose={(id) =>
              setDismissed((current) => {
                const next = new Set(current);
                next.add(id);
                return next;
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}
