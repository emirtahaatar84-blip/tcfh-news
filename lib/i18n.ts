import type { Locale } from "@/lib/i18n-config";

const dictionaries = {
  tr: () => import("@/locales/tr.json").then((module) => module.default),
  en: () => import("@/locales/en.json").then((module) => module.default),
} as const;

export type Dictionary = Awaited<ReturnType<typeof dictionaries.tr>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
