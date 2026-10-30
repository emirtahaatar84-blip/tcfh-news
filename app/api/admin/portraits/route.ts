import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import {
  isPortraitPipelineRunning,
  runPortraitPipeline,
  scoreFeedOnly,
} from "@/lib/portrait-pipeline";
import { serializePortrait } from "@/lib/portrait-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/admin/portraits (owner)
 *   → son çalıştırmalar, adaylar (puanlı) ve tüm portreler.
 *
 * POST /api/admin/portraits (owner)
 *   { action: "run" | "dry" }
 *   → hattı çalıştırır veya yalnızca skorlama yapar.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const [runs, candidates, portraits, counts] = await Promise.all([
    prisma.portraitRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.portraitCandidate.findMany({
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.portrait.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { sources: true },
    }),
    prisma.portrait.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json(
    {
      running: isPortraitPipelineRunning(),
      counts: Object.fromEntries(
        counts.map((row) => [row.status, row._count._all]),
      ),
      runs: runs.map((run) => ({
        id: run.id,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        status: run.status,
        fetched: run.fetched,
        fresh: run.fresh,
        scored: run.scored,
        queued: run.queued,
        published: run.published,
        review: run.review,
        failed: run.failed,
        note: run.note,
      })),
      candidates: candidates.map((row) => ({
        id: row.id,
        title: row.title,
        sourceUrl: row.sourceUrl,
        category: row.category,
        score: row.score / 10,
        scoreReason: row.scoreReason,
        status: row.status,
        failureReason: row.failureReason,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        portraitId: row.portraitId,
      })),
      portraits: portraits.map((row) => ({
        ...serializePortrait(row),
        reviewNotes: row.reviewNotes,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let action = "run";

  try {
    const body = (await request.json()) as { action?: unknown };
    if (typeof body.action === "string") action = body.action;
  } catch {
    // Gövde yok → varsayılan "run".
  }

  if (action === "dry") {
    const result = await scoreFeedOnly(20);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (isPortraitPipelineRunning()) {
    return NextResponse.json(
      { success: false, status: "running" },
      { status: 409 },
    );
  }

  // Hat uzun sürebilir: arka planda başlat, hemen yanıt ver.
  void runPortraitPipeline().catch((error: unknown) => {
    console.error("[portrait] admin run failed:", error);
  });

  return NextResponse.json(
    { success: true, status: "started" },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
