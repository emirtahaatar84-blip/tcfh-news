import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchNews, SEARCH_MAX_PAGE_SIZE } from "@/lib/search-fts";
import { parseJsonArray } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LIMIT = 8;
const MAX_QUERY_LENGTH = 60;

function intParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Komut paleti araması (FTS5 + bm25).
 *
 * Sorgu parametreleri:
 *   q          — arama metni (en az 2 karakter)
 *   kategori   — kategori filtresi
 *   gun        — son N gün
 *   minKaynak  — en az kaynak sayısı
 *   page       — 1 tabanlı sayfa
 *   limit      — sayfa boyutu (en fazla 50)
 *
 * KVKK: sorgu metni SUNUCUDA SAKLANMAZ; yalnızca istek süresince
 * değerlendirilir. Yanıt 60 sn boyunca CDN'de önbelleklenebilir.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const category = (searchParams.get("kategori") ?? "").trim().slice(0, 40) || null;
  const days = intParam(searchParams.get("gun"));
  const minSources = intParam(searchParams.get("minKaynak"));
  const page = intParam(searchParams.get("page")) ?? 1;
  const limit = Math.min(
    Math.max(intParam(searchParams.get("limit")) ?? LIMIT, 1),
    SEARCH_MAX_PAGE_SIZE,
  );

  const headers = { "Cache-Control": "public, max-age=60" };

  if (query.length < 2) {
    return NextResponse.json({ items: [], total: 0, took_ms: 0 }, { headers });
  }

  const result = await searchNews(query, {
    category,
    days: days && days > 0 ? Math.min(days, 3650) : null,
    minSources: minSources && minSources > 0 ? minSources : null,
    page,
    pageSize: limit,
  });

  // Kaynak adları (komut paletinin `sources` alanı) ayrı ve tek sorguda alınır.
  const ids = result.items.map((row) => row.id);
  const sourceRows = ids.length
    ? await prisma.newsItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, sourcesList: true },
      })
    : [];
  const sourcesById = new Map<string, string>(
    sourceRows.map((row) => [row.id, row.sourcesList] as const),
  );

  return NextResponse.json(
    {
      items: result.items.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        category: row.category,
        tags: row.tags,
        sourcesCount: row.sourcesCount,
        sources: parseJsonArray(sourcesById.get(row.id)).slice(0, 3),
        createdAt: row.createdAt.toISOString(),
      })),
      total: result.total,
      took_ms: result.took_ms,
    },
    { headers },
  );
}
