"use client";

import { CommandPalette } from "@/components/CommandPalette";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
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
 * ⌘K / Ctrl+K komut paleti. Görünür tetikleyici yoktur: masaüstü menüdeki
 * arama düğmesi `eth:open-search` olayını yayar.
 */
export function GlobalSearch({ lang, labels }: Props) {
  return <CommandPalette lang={lang} labels={labels} renderTrigger={false} />;
}
