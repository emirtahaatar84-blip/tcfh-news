import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { healPortraitCovers } from "@/lib/portrait-image";
import { prisma } from "@/lib/prisma";
import {
  isPortraitPipelineRunning,
  runPortraitPipeline,
  scoreFeedOnly,
} from "@/lib/portrait-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST/GET /api/cron/portrait?key=CRON_SECRET_KEY
 *
 * Portre otomasyon hattını çalıştırır (Ek Bölüm 9.7).
 *   ?dry=1 → yalnızca feed'i okuyup puanları döndürür (yayın yapmaz).
 *   ?wait=1 → senkron çalıştırıp özeti döndürür (küçük testler için).
 *
 * Varsayılan davranış: 202 döner ve hat arka planda çalışır, böylece
 * Cloudflare/gateway zaman aşımlarına takılmaz.
 */
async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  // Bakım: eksik kapak görsellerini yeniden üret (telifsiz AI illüstrasyon).
  if (params.get("heal") === "1") {
    const rows = await prisma.portrait.findMany({
      where: { status: "published", removedAt: null },
      select: { id: true, title: true, category: true, subjectType: true },
    });

    const queued = await healPortraitCovers(rows);

    return NextResponse.json(
      { success: true, checked: rows.length, queued },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (params.get("dry") === "1") {
    const result = await scoreFeedOnly(20);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (isPortraitPipelineRunning()) {
    return NextResponse.json(
      { success: false, status: "running", message: "Portre hattı zaten çalışıyor." },
      { status: 409 },
    );
  }

  if (params.get("wait") === "1") {
    const kind = (params.get("run") ?? "morning") as "morning" | "evening" | "watchdog";
    const summary = await runPortraitPipeline({
      trigger: kind,
      quota: Number(params.get("quota") ?? (kind === "evening" ? 1 : 1)),
    });
    return NextResponse.json(
      { success: summary.status === "ok", trigger: kind, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  void runPortraitPipeline().catch((error: unknown) => {
    console.error("[portrait] pipeline failed:", error);
  });

  return NextResponse.json(
    { success: true, status: "started" },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
