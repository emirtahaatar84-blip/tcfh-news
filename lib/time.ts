import type { Locale } from "@/lib/i18n-config";

export function formatRelativeTime(
  value: string | Date,
  locale: Locale | string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absolute < 60) return formatter.format(0, "second");
  if (absolute < 3600) {
    return formatter.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absolute < 86_400) {
    return formatter.format(Math.round(diffSeconds / 3600), "hour");
  }
  if (absolute < 604_800) {
    return formatter.format(Math.round(diffSeconds / 86_400), "day");
  }
  if (absolute < 2_592_000) {
    return formatter.format(Math.round(diffSeconds / 604_800), "week");
  }
  if (absolute < 31_536_000) {
    return formatter.format(Math.round(diffSeconds / 2_592_000), "month");
  }

  return formatter.format(Math.round(diffSeconds / 31_536_000), "year");
}

export function formatFullDate(
  value: string | Date,
  locale: Locale | string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
