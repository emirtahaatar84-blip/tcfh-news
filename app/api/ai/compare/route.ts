import { NextRequest, NextResponse } from "next/server";
import { AiUnavailableError, compareSources } from "@/lib/ai";
import { allowRequest } from "@/lib/rate-limit";
import { parseSourcesMeta } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CacheEntry = { at: number; payload: unknown };
const CACHE_TTL_MS = 30 * 60 * 1000;

const globalCache = globalThis as unknown as {
  aiCompareCache?: Map<string, CacheEntry>;
};

function cache(): Map<string, CacheEntry> {
  if (!globalCache.aiCompareCache) globalCache.aiCompareCache = new Map();
  return globalCache.aiCompareCache;
}

/**
 * "Kaynak karşılaştır": aynı olayı işleyen kaynakları yan yana getirir.
 * Kaynak başlıkları yayın anında kaydedilen meta veriden gelir.
 */
export async function POST(request: NextRequest) {
  if (!allowRequest("compare", 20)) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let id = "";

  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  for (const [key, entry] of cache()) {
    if (Date.now() - entry.at >= CACHE_TTL_MS) cache().delete(key);
  }

  const cached = cache().get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const item = await prisma.newsItem.findUnique({ where: { id } });
  if (!item || item.removedAt !== null) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const sources = parseSourcesMeta(item.sourcesMeta, item.sourcesList);

  if (sources.length < 2) {
    return NextResponse.json(
      { success: false, error: "NOT_ENOUGH_SOURCES" },
      { status: 409 },
    );
  }

  try {
    const result = await compareSources({
      title: item.title,
      summary: item.summary,
      sources: sources.map((source) => ({
        name: source.name,
        headline: source.headline || item.title,
      })),
    });

    const payload = {
      success: true,
      ...result,
      sources: sources.map((source) => ({
        name: source.name,
        url: source.url,
        fetchedAt: source.fetchedAt,
        headline: source.headline,
      })),
    };

    cache().set(id, { at: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const unavailable = error instanceof AiUnavailableError;

    return NextResponse.json(
      {
        success: false,
        error: unavailable ? "AI_UNAVAILABLE" : "AI_FAILED",
      },
      { status: unavailable ? 503 : 502 },
    );
  }
}
