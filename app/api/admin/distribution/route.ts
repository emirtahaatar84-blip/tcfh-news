import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { distributionReport, retryFailedDistributions } from "@/lib/distribution/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/distribution — son 24 saatte kanal bazlı yayılma özeti.
 * POST /api/admin/distribution — bekleyen başarısız denemeleri elle çalıştır.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const hours = Math.min(168, Number(new URL(request.url).searchParams.get("saat") ?? "24") || 24);

  const [report, recent] = await Promise.all([
    distributionReport(hours),
    prisma.distributionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, newsId: true, channel: true, status: true,
        attempt: true, error: true, durationMs: true, createdAt: true,
      },
    }),
  ]);

  return NextResponse.json(
    { ...report, recent },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const result = await retryFailedDistributions(30);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
