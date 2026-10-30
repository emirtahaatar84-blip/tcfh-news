import type { Prisma } from "@prisma/client";
import { isCategory } from "@/lib/categories";

/**
 * /portreler liste sayfası filtreleri (Ek Bölüm 9.5).
 * Tümü URL query parametrelerinde taşınır → paylaşılabilir + geri tuşu.
 *
 * Örnek: /tr/portreler?category=Savunma&type=kisi&range=month&q=siper&sort=views
 */

export const PORTRAIT_RANGES = ["week", "month", "all"] as const;
export type PortraitRange = (typeof PORTRAIT_RANGES)[number];

export const PORTRAIT_TYPES = ["kisi", "kurum", "olay"] as const;
export type PortraitType = (typeof PORTRAIT_TYPES)[number];

export const PORTRAIT_SORTS = ["new", "views"] as const;
export type PortraitSort = (typeof PORTRAIT_SORTS)[number];

export type PortraitFilters = {
  query: string | null;
  category: string | null;
  type: PortraitType | null;
  range: PortraitRange;
  sort: PortraitSort;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parsePortraitFilters(
  searchParams: SearchParams,
): PortraitFilters {
  const queryRaw = first(searchParams.q).trim();
  const categoryRaw = first(searchParams.category).trim();

  const typeRaw = first(searchParams.type).trim();
  const rangeRaw = first(searchParams.range).trim();
  const sortRaw = first(searchParams.sort).trim();

  return {
    query: queryRaw ? queryRaw.slice(0, 80) : null,
    category: isCategory(categoryRaw) ? categoryRaw : null,
    type: (PORTRAIT_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as PortraitType)
      : null,
    range: (PORTRAIT_RANGES as readonly string[]).includes(rangeRaw)
      ? (rangeRaw as PortraitRange)
      : "all",
    sort: (PORTRAIT_SORTS as readonly string[]).includes(sortRaw)
      ? (sortRaw as PortraitSort)
      : "new",
  };
}

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

function rangeStart(range: PortraitRange, now = new Date()): Date | null {
  if (range === "all") return null;

  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const startOfDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );

  const days = range === "week" ? 6 : 29;

  return new Date(startOfDay - days * 24 * 60 * 60 * 1000 - ISTANBUL_OFFSET_MS);
}

export function buildPortraitWhere(
  filters: PortraitFilters,
): Prisma.PortraitWhereInput {
  const conditions: Prisma.PortraitWhereInput[] = [
    { status: "published" },
    { removedAt: null },
  ];

  if (filters.category) conditions.push({ category: filters.category });
  if (filters.type) conditions.push({ subjectType: filters.type });

  const start = rangeStart(filters.range);
  if (start) conditions.push({ publishedAt: { gte: start } });

  if (filters.query) {
    conditions.push({
      OR: [
        { title: { contains: filters.query } },
        { subtitle: { contains: filters.query } },
        { subjectName: { contains: filters.query } },
        { keyFacts: { contains: filters.query } },
      ],
    });
  }

  return { AND: conditions };
}

export function buildPortraitOrderBy(
  sort: PortraitSort,
): Prisma.PortraitOrderByWithRelationInput[] {
  return sort === "views"
    ? [{ viewCount: "desc" }, { publishedAt: "desc" }]
    : [{ publishedAt: "desc" }, { id: "desc" }];
}

export function portraitListHref(
  lang: string,
  filters: PortraitFilters,
): string {
  const params = new URLSearchParams();

  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("category", filters.category);
  if (filters.type) params.set("type", filters.type);
  if (filters.range !== "all") params.set("range", filters.range);
  if (filters.sort !== "new") params.set("sort", filters.sort);

  const query = params.toString();
  return query ? `/${lang}/portreler?${query}` : `/${lang}/portreler`;
}

export function hasPortraitFilters(filters: PortraitFilters): boolean {
  return Boolean(
    filters.query ||
      filters.category ||
      filters.type ||
      filters.range !== "all",
  );
}
