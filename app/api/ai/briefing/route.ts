import { NextResponse } from "next/server";
import { AiUnavailableError, buildBriefing } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { at: number; payload: unknown };

const globalCache = globalThis as unknown as {
  aiBriefingCache?: CacheEntry | null;
};

function cached(): CacheEntry | null {
  const entry = globalCache.aiBriefingCache;
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry;
}

/**
 * Günün brifingi: son 24 saatteki en yeni 8 haberden 5 maddelik sabah özeti.
 * Yalnızca TOPLU (anonim) veriden üretilir; kişiselleştirilmez.
 * Sonuç 30 dk süreç belleğinde tutulur.
 */
export async function GET() {
  const hit = cached();
  if (hit) {
    return NextResponse.json(hit.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await prisma.newsItem.findMany({
    where: { removedAt: null, createdAt: { gte: since } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
    select: { title: true, summary: true },
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "NO_NEWS" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await buildBriefing({ headlines: rows });

    const payload = { success: true, ...result };
    globalCache.aiBriefingCache = { at: Date.now(), payload };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const unavailable = error instanceof AiUnavailableError;

    return NextResponse.json(
      { success: false, error: unavailable ? "AI_UNAVAILABLE" : "AI_FAILED" },
      { status: unavailable ? 503 : 502 },
    );
  }
}
