import type { Prisma } from "@prisma/client";
import { foldTurkish, STOP_WORDS } from "@/lib/hq/normalize";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/utils";

/**
 * FTS5 tabanlı haber araması.
 *
 * `prisma/migrations/20261101200000_fts5_search` ile kurulan `NewsItemFts`
 * sanal tablosu kullanılır (bm25 alaka sıralaması). Migration uygulanmamış
 * bir veritabanında (ya da FTS5 derlenmemişse) arama sessizce `LIKE`
 * sorgusuna, o da sonuç vermezse kelime bazlı Levenshtein (≤2) yedeğine
 * düşer — böylece uç nokta her koşulda çalışır.
 *
 * KVKK: sorgu metni saklanmaz; yalnızca istek süresince değerlendirilir.
 */

export type SearchOptions = {
  /** Kategori filtresi (tam eşleşme). */
  category?: string | null;
  /** Son N gün (createdAt >= now - N gün). */
  days?: number | null;
  /** En az kaynak sayısı. */
  minSources?: number | null;
  /** Etiket filtresi ("@nvidia" veya "nvidia"). */
  tag?: string | null;
  /** 1 tabanlı sayfa numarası. */
  page?: number;
  /** Sayfa başına kayıt (varsayılan 8, en fazla 50). */
  pageSize?: number;
};

export type SearchResultItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  sourcesCount: number;
  createdAt: Date;
};

export type SearchResult = {
  items: SearchResultItem[];
  total: number;
  took_ms: number;
  /** Hangi yolun kullanıldığı (tanılama için). */
  engine: "fts" | "like" | "fuzzy";
};

export const SEARCH_PAGE_SIZE = 8;
export const SEARCH_MAX_PAGE_SIZE = 50;
export const SEARCH_MAX_QUERY = 100;

/** bm25 ağırlıkları: başlık, özet, gövde, etiket. */
const BM25_WEIGHTS = "3.0, 1.5, 1.0, 2.0";

type FtsRow = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string;
  sourcesCount: number;
  createdAt: Date | number | string;
  rank: number;
};

/* ─── Sorgu hazırlığı ─────────────────────────────────────────────────────── */

function clampPage(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) < 1) return 1;
  return Math.min(Math.floor(value as number), 500);
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) < 1) return SEARCH_PAGE_SIZE;
  return Math.min(Math.floor(value as number), SEARCH_MAX_PAGE_SIZE);
}

/**
 * foldTurkish zaten noktasız "ı"yı "i"ye indirger. FTS indeksi ise metni
 * olduğu gibi saklar (ı diakritik olmadığı için korunur). Bu yüzden "i"
 * harflerinin i/ı kombinasyonları üretilir: "kirmizi" → "kırmızı".
 */
function dotlessVariants(token: string): string[] {
  const positions: number[] = [];
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === "i") positions.push(index);
  }
  if (positions.length === 0) return [token];
  // Aşırı çoğalmayı engelle: 5+ "i" varsa yalnızca tam noktasız hâli eklenir.
  if (positions.length > 4) {
    return Array.from(new Set([token, token.replaceAll("i", "ı")]));
  }

  const variants: string[] = [];
  const total = 1 << positions.length;
  for (let mask = 0; mask < total; mask += 1) {
    const chars = token.split("");
    positions.forEach((position, bit) => {
      if (mask & (1 << bit)) chars[position] = "ı";
    });
    variants.push(chars.join(""));
  }
  return variants;
}

/** Sorgu metnini FTS5 MATCH ifadesine çevirir (token AND, önek eşleşmesi). */
function buildMatchExpression(query: string): string | null {
  const allTokens = foldTurkish(query)
    .split(" ")
    .filter((token) => token.length >= 2 && /^[a-z0-9]+$/.test(token));
  if (allTokens.length === 0) return null;

  // Tamamı dolgu kelimesiyse (ör. "ve") filtreleme yapma.
  const meaningful = allTokens.filter((token) => !STOP_WORDS.has(token));
  const tokens = Array.from(new Set(meaningful.length > 0 ? meaningful : allTokens)).slice(0, 8);

  const groups = tokens.map((token) => {
    const variants = Array.from(new Set(dotlessVariants(token)));
    return `(${variants.map((variant) => `"${variant}"*`).join(" OR ")})`;
  });

  return groups.join(" AND ");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Etiket filtresi: JSON dizedeki "@etiket" değerini arar. */
function tagPattern(tag: string): string {
  return `%"@${escapeLike(tag.replace(/^@/, ""))}"%`;
}

function startDateForDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/* ─── Levenshtein (yazım toleransı) ───────────────────────────────────────── */

function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    // Satır minimumu eşiği aştıysa erken çık.
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/* ─── Sonuç eşleme ────────────────────────────────────────────────────────── */

function toDate(value: FtsRow["createdAt"]): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

function mapRow(row: FtsRow): SearchResultItem {
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: parseJsonArray(row.tags),
    sourcesCount: row.sourcesCount,
    createdAt: toDate(row.createdAt),
  };
}

/* ─── Prisma WHERE (LIKE yedeği) ──────────────────────────────────────────── */

function buildPrismaWhere(query: string, options: SearchOptions): Prisma.NewsItemWhereInput {
  const conditions: Prisma.NewsItemWhereInput[] = [{ removedAt: null }];
  const folded = query.replace(/^@/, "");

  conditions.push({
    OR: [
      { title: { contains: query } },
      { summary: { contains: query } },
      { detailedContent: { contains: query } },
      { sourcesList: { contains: query } },
      { tags: { contains: query } },
      { tags: { contains: folded } },
    ],
  });

  if (options.category) conditions.push({ category: options.category });
  if (options.tag) conditions.push({ tags: { contains: `"@${options.tag.replace(/^@/, "")}"` } });
  if (options.minSources && options.minSources > 1) {
    conditions.push({ sourcesCount: { gte: options.minSources } });
  }
  if (options.days && options.days > 0) {
    conditions.push({ createdAt: { gte: startDateForDays(options.days) } });
  }

  return { AND: conditions };
}

const RESULT_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: true,
  tags: true,
  sourcesCount: true,
  createdAt: true,
} as const;

/* ─── Arama yolları ───────────────────────────────────────────────────────── */

async function searchWithFts(
  query: string,
  options: SearchOptions,
  page: number,
  pageSize: number,
): Promise<SearchResult> {
  const match = buildMatchExpression(query);
  if (!match) return { items: [], total: 0, took_ms: 0, engine: "fts" };

  const conditions: string[] = ["NewsItemFts MATCH ?", "n.removedAt IS NULL"];
  const params: unknown[] = [match];

  if (options.category) {
    conditions.push("n.category = ?");
    params.push(options.category);
  }
  if (options.tag) {
    conditions.push("n.tags LIKE ? ESCAPE '\\'");
    params.push(tagPattern(options.tag));
  }
  if (options.minSources && options.minSources > 1) {
    conditions.push("n.sourcesCount >= ?");
    params.push(options.minSources);
  }
  if (options.days && options.days > 0) {
    conditions.push("n.createdAt >= ?");
    params.push(startDateForDays(options.days).getTime());
  }

  // MATCH ifadesi FTS tablosuna, diğer filtreler içerik tablosuna uygulanır.
  const where = conditions.join(" AND ");

  const countRows = await prisma.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT count(*) AS total
       FROM NewsItemFts
       JOIN NewsItem n ON n.rowid = NewsItemFts.rowid
      WHERE ${where}`,
    ...params,
  );

  const total = Number(countRows[0]?.total ?? 0);
  if (total === 0) return { items: [], total: 0, took_ms: 0, engine: "fts" };

  const rows = await prisma.$queryRawUnsafe<FtsRow[]>(
    `SELECT n.id, n.slug, n.title, n.summary, n.category, n.tags,
            n.sourcesCount, n.createdAt,
            bm25(NewsItemFts, ${BM25_WEIGHTS}) AS rank
       FROM NewsItemFts
       JOIN NewsItem n ON n.rowid = NewsItemFts.rowid
      WHERE ${where}
      ORDER BY rank ASC, n.createdAt DESC
      LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );

  return { items: rows.map(mapRow), total, took_ms: 0, engine: "fts" };
}

async function searchWithLike(
  query: string,
  options: SearchOptions,
  page: number,
  pageSize: number,
): Promise<SearchResult> {
  const where = buildPrismaWhere(query, options);

  const [total, rows] = await Promise.all([
    prisma.newsItem.count({ where }),
    prisma.newsItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: RESULT_SELECT,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      slug: row.slug ?? row.id,
      tags: parseJsonArray(row.tags),
    })),
    total,
    took_ms: 0,
    engine: "like",
  };
}

/**
 * Yazım toleransı: FTS ve LIKE sonuç vermediyse son kayıtlar taranır ve
 * kelime bazlı Levenshtein (≤2) ile eşleşenler döndürülür.
 */
async function searchWithFuzzy(
  query: string,
  options: SearchOptions,
  page: number,
  pageSize: number,
): Promise<SearchResult> {
  const queryTokens = Array.from(
    new Set(
      foldTurkish(query)
        .split(" ")
        .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
    ),
  ).slice(0, 5);
  if (queryTokens.length === 0) {
    return { items: [], total: 0, took_ms: 0, engine: "fuzzy" };
  }

  const conditions: Prisma.NewsItemWhereInput[] = [{ removedAt: null }];
  if (options.category) conditions.push({ category: options.category });
  if (options.tag) conditions.push({ tags: { contains: `"@${options.tag.replace(/^@/, "")}"` } });
  if (options.minSources && options.minSources > 1) {
    conditions.push({ sourcesCount: { gte: options.minSources } });
  }
  if (options.days && options.days > 0) {
    conditions.push({ createdAt: { gte: startDateForDays(options.days) } });
  }

  // Tolerans taraması yalnızca son 800 kayıtla sınırlıdır (maliyet kontrolü).
  const candidates = await prisma.newsItem.findMany({
    where: { AND: conditions },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 800,
    select: RESULT_SELECT,
  });

  const scored: Array<{ item: SearchResultItem; score: number }> = [];

  for (const row of candidates) {
    const haystack = foldTurkish(
      `${row.title} ${row.summary} ${row.tags.replace(/[^\p{L}\p{N}]+/gu, " ")}`,
    )
      .split(" ")
      .filter((word) => word.length >= 3);
    const uniqueWords = Array.from(new Set(haystack));

    let hits = 0;
    for (const token of queryTokens) {
      const best = uniqueWords.reduce((min, word) => {
        if (Math.abs(word.length - token.length) > 2) return min;
        return Math.min(min, levenshtein(token, word, 2));
      }, 3);
      if (best <= 2) hits += 1;
    }

    if (hits > 0) {
      scored.push({
        item: {
          ...row,
          slug: row.slug ?? row.id,
          tags: parseJsonArray(row.tags),
        },
        score: hits,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.item.createdAt.getTime() - a.item.createdAt.getTime();
  });

  const start = (page - 1) * pageSize;
  return {
    items: scored.slice(start, start + pageSize).map((entry) => entry.item),
    total: scored.length,
    took_ms: 0,
    engine: "fuzzy",
  };
}

/* ─── Genel giriş noktası ─────────────────────────────────────────────────── */

/**
 * Haberlerde tam metin arama.
 *
 * @example
 * const result = await searchNews("yapay zeka", { category: "Teknoloji", days: 30 });
 * result.items; // [{ id, title, summary, category, tags, sourcesCount, createdAt }]
 */
export async function searchNews(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const startedAt = Date.now();
  const trimmed = (query ?? "").trim().slice(0, SEARCH_MAX_QUERY);
  const page = clampPage(options.page);
  const pageSize = clampPageSize(options.pageSize);

  const finish = (result: SearchResult): SearchResult => ({
    ...result,
    took_ms: Date.now() - startedAt,
  });

  if (trimmed.length < 2) {
    return finish({ items: [], total: 0, took_ms: 0, engine: "fts" });
  }

  // 1) FTS5 (migration uygulanmamışsa hata fırlatır → yedeğe düşülür).
  try {
    const fts = await searchWithFts(trimmed, options, page, pageSize);
    if (fts.total > 0) return finish(fts);
  } catch {
    // Sanal tablo yok / FTS5 desteklenmiyor: LIKE yedeğine devam.
  }

  // 2) LIKE (mevcut davranışın eşdeğeri).
  try {
    const like = await searchWithLike(trimmed, options, page, pageSize);
    if (like.total > 0) return finish(like);
  } catch {
    // LIKE de başarısız olduysa tolerans taramasına geç.
  }

  // 3) Yazım toleransı (Levenshtein ≤ 2).
  try {
    return finish(await searchWithFuzzy(trimmed, options, page, pageSize));
  } catch {
    return finish({ items: [], total: 0, took_ms: 0, engine: "fuzzy" });
  }
}
