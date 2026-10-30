import { NextRequest, NextResponse } from "next/server";
import { AiUnavailableError, summarizeArticle } from "@/lib/ai";
import { allowRequest } from "@/lib/rate-limit";
import { parseSourcesMeta } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { at: number; payload: unknown };

const globalCache = globalThis as unknown as {
  aiSummaryCache?: Map<string, CacheEntry>;
};

function cache(): Map<string, CacheEntry> {
  if (!globalCache.aiSummaryCache) globalCache.aiSummaryCache = new Map();
  return globalCache.aiSummaryCache;
}

/**
 * "AI ile özetle": 3 madde + tek cümlelik özet.
 * Yalnızca sunucu tarafında çalışır; API anahtarı istemciye gitmez.
 * Sonuç bellekte 30 dk önbelleklenir (kişisel veri içermez).
 */
export async function POST(request: NextRequest) {
  if (!allowRequest("summary", 20)) {
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

  // Süresi geçmiş girdileri temizle (bellek şişmesin).
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

  try {
    const result = await summarizeArticle({
      title: item.title,
      summary: item.summary,
      body: item.detailedContent ?? item.summary,
      category: item.category,
    });

    const payload = { success: true, ...result };
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
        sources: parseSourcesMeta(item.sourcesMeta, item.sourcesList).length,
      },
      { status: unavailable ? 503 : 502 },
    );
  }
}
