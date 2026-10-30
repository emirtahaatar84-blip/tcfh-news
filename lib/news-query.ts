import type { Prisma } from "@prisma/client";
import { isCategory } from "@/lib/categories";
import { cityFromParam } from "@/lib/geo";

/**
 * Genel akış filtreleri. Tümü URL query parametrelerine yazılır; böylece
 * bağlantı paylaşılabilir ve tarayıcı geri tuşu doğru çalışır.
 *
 * Örnek: /tr?q=iklim&category=Spor&category=Bilim&range=week&source=BBC&time=short
 */

export const DATE_RANGES = ["today", "week", "month", "all"] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const READING_TIMES = ["short", "medium", "long"] as const;
export type ReadingTime = (typeof READING_TIMES)[number];

export const MAX_QUERY_LENGTH = 100;
export const MAX_FILTER_SOURCES = 5;

export type FeedFilters = {
  query: string | null;
  categories: string[];
  dateRange: DateRange;
  sources: string[];
  readingTime: ReadingTime | null;
  /** İsteğe bağlı il (yalnızca cihazda seçilen). */
  city?: string | null;
};

export const EMPTY_FILTERS: FeedFilters = {
  query: null,
  categories: [],
  dateRange: "all",
  sources: [],
  readingTime: null,
};

type SearchParams = Record<string, string | string[] | undefined>;

function valuesOf(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

/** Desteklenmeyen değerleri sessizce yok sayar (URL elle düzenlenebilir). */
export function parseFeedFilters(searchParams: SearchParams): FeedFilters {
  const rawQuery = valuesOf(searchParams.q)[0]?.trim() ?? "";
  const query = rawQuery ? rawQuery.slice(0, MAX_QUERY_LENGTH) : null;

  const categories = Array.from(
    new Set(valuesOf(searchParams.category).filter(isCategory)),
  );

  const rangeValue = valuesOf(searchParams.range)[0] ?? "";
  const dateRange: DateRange = (DATE_RANGES as readonly string[]).includes(
    rangeValue,
  )
    ? (rangeValue as DateRange)
    : "all";

  const sources = Array.from(
    new Set(
      valuesOf(searchParams.source)
        .map((value) => value.trim().slice(0, 80))
        .filter(Boolean),
    ),
  ).slice(0, MAX_FILTER_SOURCES);

  const timeValue = valuesOf(searchParams.time)[0] ?? "";
  const readingTime: ReadingTime | null = (
    READING_TIMES as readonly string[]
  ).includes(timeValue)
    ? (timeValue as ReadingTime)
    : null;

  // İl adı yalnızca bilinen 81 ilden biri olabilir (sunucu doğrulaması).
  const city = cityFromParam(valuesOf(searchParams.city)[0] ?? null);

  return { query, categories, dateRange, sources, readingTime, city };
}

/** Filtrelerin "aktif" olup olmadığını döndürür (boş durum metni için). */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return Boolean(
    filters.query ||
      filters.categories.length > 0 ||
      filters.sources.length > 0 ||
      filters.readingTime ||
      filters.dateRange !== "all",
  );
}

/** Europe/Istanbul sabit ofseti (yaz saati uygulaması 2016'dan beri yok). */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfRange(range: DateRange, now: Date = new Date()): Date | null {
  if (range === "all") return null;

  // Türkiye saatine göre gün başı (sunucu UTC olsa bile doğru).
  const istanbulNow = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const startIstanbul = Date.UTC(
    istanbulNow.getUTCFullYear(),
    istanbulNow.getUTCMonth(),
    istanbulNow.getUTCDate(),
  );

  const start = new Date(startIstanbul - ISTANBUL_OFFSET_MS);

  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(start.getDate() - 29);

  return start;
}

/** Çoklu seçim: "A ve B" yerine "A veya B" (kategori filtresi). */
function categoryValues(categories: string[]): string[] {
  return categories;
}

export function buildNewsWhere(filters: FeedFilters): Prisma.NewsItemWhereInput {
  const conditions: Prisma.NewsItemWhereInput[] = [{ removedAt: null }];

  if (filters.categories.length > 0) {
    conditions.push({ category: { in: categoryValues(filters.categories) } });
  }

  if (filters.query) {
    conditions.push({
      OR: [
        { title: { contains: filters.query } },
        { summary: { contains: filters.query } },
        { detailedContent: { contains: filters.query } },
        { sourcesList: { contains: filters.query } },
      ],
    });
  }

  const rangeStart = startOfRange(filters.dateRange);
  if (rangeStart) {
    conditions.push({ createdAt: { gte: rangeStart } });
  }

  if (filters.sources.length > 0) {
    conditions.push({
      OR: filters.sources.map((source) => ({
        sourcesList: { contains: source },
      })),
    });
  }

  if (filters.city) {
    conditions.push({ city: filters.city });
  }

  if (filters.readingTime === "short") {
    conditions.push({ readingMinutes: { lte: 2 } });
  } else if (filters.readingTime === "medium") {
    conditions.push({ readingMinutes: { gte: 3, lte: 6 } });
  } else if (filters.readingTime === "long") {
    conditions.push({ readingMinutes: { gte: 7 } });
  }

  return { AND: conditions };
}

/**
 * Filtreleri URLSearchParams'a yazar. `q` her zaman korunur; boş değerler
 * parametre olarak eklenmez (temiz URL).
 */
export function filtersToSearchParams(
  filters: FeedFilters,
  extra: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query) params.set("q", filters.query);
  for (const category of filters.categories) params.append("category", category);
  if (filters.dateRange !== "all") params.set("range", filters.dateRange);
  for (const source of filters.sources) params.append("source", source);
  if (filters.readingTime) params.set("time", filters.readingTime);
  if (filters.city) params.set("city", filters.city);

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  return params;
}

export function feedHref(lang: string, filters: FeedFilters): string {
  const query = filtersToSearchParams(filters).toString();
  return query ? `/${lang}?${query}` : `/${lang}`;
}

/** Akış sayfası boyutu ve güvenli sayfa numarası çözümlemesi. */
export const FEED_PAGE_SIZE = 20;
export const MAX_FEED_PAGE = 12;

export function parseFeedPage(
  value: string | string[] | undefined,
  maxPage: number = MAX_FEED_PAGE,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, maxPage);
}

/** Sonraki sayfanın adresi — JS kapalıyken de çalışan yedek bağlantı. */
export function feedPageHref(
  lang: string,
  filters: FeedFilters,
  page: number,
  basePath?: string,
): string {
  const params = filtersToSearchParams(filters, {
    page: String(page),
    limit: String(FEED_PAGE_SIZE),
  });

  const path = basePath ?? `/${lang}/haberler`;
  return `${path}?${params.toString()}`;
}

/** Okuma süresi etiketi için aralık tanımı (arayüzde açıklama olarak). */
export const READING_TIME_LABELS: Record<
  ReadingTime,
  { min: number; max: number | null }
> = {
  short: { min: 1, max: 2 },
  medium: { min: 3, max: 6 },
  long: { min: 7, max: null },
};
