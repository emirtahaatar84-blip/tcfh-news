"use client";

import { useState } from "react";
import { NewsCard } from "@/components/NewsCard";
import type { FeedNewsItem } from "@/lib/news-types";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";

/**
 * Kategori sayfası haber listesi — client sarmalayıcı.
 *
 * NEDEN: `NewsCard` bir client bileşendir ve `onClose` olay işleyicisi
 * ister. Sunucu bileşeninden fonksiyon geçirilemez
 * ("Event handlers cannot be passed to Client Component props").
 * Bu sarmalayıcı, sunucudan gelen saf veriyi alır; kart kapatma
 * durumunu istemcide yönetir (oturum bazlı, kalıcı değil).
 */
export function CategoryNewsList({
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
      <p className="rounded-2xl border border-dashed border-[#22252a] px-space-4 py-space-6 text-center text-sm text-zinc-500">
        {locale === "en" ? "No stories found." : "Haber bulunamadı."}
      </p>
    );
  }

  return (
    <>
      {visible.map((item) => (
        <NewsCard
          key={item.id}
          item={item}
          locale={locale}
          bookmarksMode={false}
          cardLabels={dict.card}
          categoryLabels={dict.categories}
          onClose={(id) =>
            setDismissed((current) => {
              const next = new Set(current);
              next.add(id);
              return next;
            })
          }
        />
      ))}
    </>
  );
}
