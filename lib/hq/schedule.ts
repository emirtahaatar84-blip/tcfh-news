import { SCHEDULE, PORTRAIT_RUN } from "./config";

/**
 * Saat dilimi güvenli zamanlayıcı. Sunucu UTC'de çalışsa da hedef saat
 * Europe/Istanbul'dur; yaz saati geçişleri Intl ile çözülür.
 */

export type RunKind = "morning" | "evening" | "watchdog";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(date: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Yerel duvar saatini UTC'ye çevirir (iki geçişli, DST güvenli). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = offsetMs(new Date(guess), timeZone);
  const first = guess - firstOffset;
  const secondOffset = offsetMs(new Date(first), timeZone);
  return new Date(guess - secondOffset);
}

function parseHhmm(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

/** Bugün (veya yarın) o saatteki ilk çalıştırma zamanı. */
export function nextOccurrence(
  hhmm: string,
  timeZone: string = SCHEDULE.timezone,
  now: Date = new Date(),
): Date {
  const { hour, minute } = parseHhmm(hhmm);
  const today = partsInZone(now, timeZone);

  let candidate = zonedTimeToUtc(today.year, today.month, today.day, hour, minute, timeZone);
  if (candidate.getTime() <= now.getTime()) {
    const nextDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
    candidate = zonedTimeToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      hour,
      minute,
      timeZone,
    );
  }
  return candidate;
}

export function nextRuns(
  now: Date = new Date(),
  timeZone: string = SCHEDULE.timezone,
): { kind: RunKind; at: Date }[] {
  const plan: { kind: RunKind; hhmm: string }[] = [
    { kind: "morning", hhmm: SCHEDULE.morning },
    { kind: "evening", hhmm: SCHEDULE.evening },
    { kind: "watchdog", hhmm: SCHEDULE.watchdog },
  ];

  return plan
    .map((item) => ({ kind: item.kind, at: nextOccurrence(item.hhmm, timeZone, now) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Şu anda hangi çalıştırma penceresi aktif (12:00 sınırı). */
export function currentRunKind(
  now: Date = new Date(),
  timeZone: string = SCHEDULE.timezone,
): RunKind {
  const p = partsInZone(now, timeZone);
  if (p.hour < 1) return "watchdog";
  return p.hour < 12 ? "morning" : "evening";
}

/** Telafi kuralı: sabah üretemediyse akşam iki adet üretir. */
export function quotaFor(kind: RunKind, morningSucceeded: boolean): number {
  if (kind === "morning") return PORTRAIT_RUN.morningQuota;
  if (kind === "evening") {
    return morningSucceeded
      ? PORTRAIT_RUN.eveningQuota
      : PORTRAIT_RUN.eveningQuotaIfMorningFailed;
  }
  return 0;
}

/** Bir çalıştırmanın bittiği an, o çalıştırmadan ±5 dk içinde mi? */
export function withinWindow(
  actual: Date,
  expected: Date,
  toleranceMinutes = 15,
): boolean {
  return Math.abs(actual.getTime() - expected.getTime()) <= toleranceMinutes * 60_000;
}
