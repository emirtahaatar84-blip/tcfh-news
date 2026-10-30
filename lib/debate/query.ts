import { prisma } from "@/lib/prisma";
import { categoryFromSlug, normalizeCategory } from "@/lib/categories";
import type { DebateLevel, DebateLevelFilter } from "@/lib/debate/config";
import { sortDebatesForFeed } from "@/lib/debate/score";
import {
  serializeDebateDetail,
  serializeDebateListItem,
  type DebateDetail,
  type DebateListItem,
} from "@/lib/debate/types";

/** Münazara akış/arşiv filtreleri — hepsi URL'de yaşar. */
export type DebateFilters = {
  level: DebateLevelFilter;
  category: string;
  /** mus: MUS sıralaması (varsayılan) · yeni: yayın tarihi · okunan: toplu sayaç */
  sort: "mus" | "yeni" | "okunan";
};

export const DEFAULT_DEBATE_FILTERS: DebateFilters = {
  level: "tumu",
  category: "",
  sort: "mus",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseDebateFilters(searchParams: SearchParams): DebateFilters {
  const rawLevel = first(searchParams.seviye).trim().toLowerCase();
  const level: DebateLevelFilter =
    rawLevel === "lise" || rawLevel === "universite" ? rawLevel : "tumu";

  const category = categoryFromSlug(first(searchParams.kategori)) ?? "";

  const rawSort = first(searchParams.sirala).trim().toLowerCase();
  const sort: DebateFilters["sort"] =
    rawSort === "yeni" ? "yeni" : rawSort === "okunan" ? "okunan" : "mus";

  return { level, category, sort };
}

export function debateFiltersToQuery(
  filters: DebateFilters,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();

  if (filters.level !== "tumu") params.set("seviye", filters.level);
  if (filters.category) {
    params.set("kategori", filters.category);
  }
  if (filters.sort !== "mus") params.set("sirala", filters.sort);

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

type ListOptions = {
  filters: DebateFilters;
  take?: number;
  /** Arşivde tüm sonuçlar; akışta en yeni 60. */
  all?: boolean;
};

export async function getDebateList(
  lang: string,
  options: ListOptions,
): Promise<DebateListItem[]> {
  const where = {
    status: "published",
    ...(options.filters.level !== "tumu"
      ? { level: options.filters.level }
      : {}),
    ...(options.filters.category
      ? { category: normalizeCategory(options.filters.category) }
      : {}),
  };

  const rows = await prisma.debateTopic.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: options.all ? undefined : (options.take ?? 60),
  });

  const items = rows.map((row) => serializeDebateListItem(row, lang));

  if (options.filters.sort === "yeni") {
    return items.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }

  if (options.filters.sort === "okunan") {
    // Toplu sayaç: kişi bazlı değil.
    return items.sort((a, b) => b.viewCount - a.viewCount);
  }

  return sortDebatesForFeed(items);
}

export async function getDebateDetail(
  lang: string,
  slug: string,
): Promise<DebateDetail | null> {
  const row = await prisma.debateTopic.findFirst({
    where: { slug, status: "published" },
    include: {
      sources: {
        orderBy: [{ isPrimary: "desc" }, { accessedAt: "asc" }],
      },
    },
  });

  if (!row) return null;
  return serializeDebateDetail(row, lang);
}

export type DebateArchiveEntry = DebateListItem & {
  publishedLabel: string;
};

/**
 * Arşiv: yayımlanmış tüm münazaralar; seviye/kategori/sıralama ile
 * filtrelenebilir. Sunucuda hesaplanır; istemci ağ isteği yapmaz.
 */
export async function getDebateArchive(
  lang: string,
  filters: DebateFilters,
): Promise<DebateArchiveEntry[]> {
  const items = await getDebateList(lang, { filters, all: true });

  return items.map((item) => ({
    ...item,
    publishedLabel: item.publishedAt.slice(0, 10),
  }));
}

/** Sağ kolon: en yeni münazaralar (3 kart). */
export async function getRecentDebates(
  lang: string,
  take = 3,
): Promise<DebateListItem[]> {
  const rows = await prisma.debateTopic.findMany({
    where: { status: "published" },
    orderBy: [{ publishedAt: "desc" }],
    take,
  });

  return rows.map((row) => serializeDebateListItem(row, lang));
}

/** Toplu (anonim) okunma sayacı — kişi/oturum/IP yok. */
export async function incrementDebateView(id: string): Promise<void> {
  try {
    await prisma.debateTopic.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    // Sayaç kritik değil; hata kullanıcıya yansımaz.
  }
}
