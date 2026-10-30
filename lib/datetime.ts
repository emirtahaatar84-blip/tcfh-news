/**
 * Türkçe tarih/saat biçimlendirme yardımcıları.
 *
 * Hedef biçim: "28 Ekim 2025, 14:05" (tr-TR).
 * Sunucu ve istemcide aynı çıktıyı üretmek için sabit bir saat dilimi
 * (Europe/Istanbul) kullanılır — hidrasyon uyuşmazlığı olmaz.
 */

export const SITE_TIME_ZONE = "Europe/Istanbul";
export const SITE_LOCALE = "tr-TR";

/** "tr" | "en" → Intl yerel ayarı. */
function intlLocale(locale?: string): string {
  return locale === "en" ? "en-GB" : SITE_LOCALE;
}

/** "28 Ekim 2025, 14:05" */
export function formatDateTime(
  value: Date | string | number,
  locale?: string,
): string {
  const date = toDate(value);
  if (!date) return "";

  const day = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: SITE_TIME_ZONE,
  }).format(date);

  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SITE_TIME_ZONE,
  }).format(date);

  return `${day}, ${time}`;
}

/** "28 Ekim 2025" */
export function formatDate(
  value: Date | string | number,
  locale?: string,
): string {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: SITE_TIME_ZONE,
  }).format(date);
}

/** "14:05" */
export function formatTime(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(SITE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SITE_TIME_ZONE,
  }).format(date);
}

/** "3 dk okuma" */
export function formatReadingTime(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} dk okuma`;
}

/** "1.234" — tr-TR binlik ayraçlı sayı. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(SITE_LOCALE).format(value);
}

/** "1.234,50 ₺" */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(SITE_LOCALE, {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(value);
}

/** Medya süresi: "1:05", "12:30", "1:02:03" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(rest).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * "az önce", "5 dakika önce", "3 saat önce", "2 gün önce" ya da
 * bir haftadan eskiyse "28 Ekim 2025, 14:05".
 */
export function formatRelative(
  value: Date | string | number,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return "";

  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 0) return formatDateTime(date);
  if (diffSeconds < 60) return "az önce";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} dakika önce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;

  return formatDateTime(date);
}

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
