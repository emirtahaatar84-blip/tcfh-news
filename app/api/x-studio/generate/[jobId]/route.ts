import { NextRequest, NextResponse } from "next/server";
import { getGenerateJob, isStudioAuthorized } from "@/lib/x-studio";

export const dynamic = "force-dynamic";

/**
 * GET /api/x-studio/generate/:jobId
 * Üretim işinin durumunu döner (polling). Bittiğinde varyantlar dahildir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const job = getGenerateJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "İş bulunamadı veya süresi doldu." },
      { status: 404 },
    );
  }

  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}
