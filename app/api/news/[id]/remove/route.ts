import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Silent story removal — visible only to the owner's account.
 *
 * Authorization (either works):
 *  - a signed-in session belonging to the owner e-mail
 *  - admin HTTP Basic credentials
 *
 * Reasons: "copyright" (telif ihlali) or "hallucination" (yanlış haber).
 * The story is SOFT-removed (removedAt/removedReason/removedBy="owner"):
 * public queries filter it out via `removedAt: null`, but the row is kept
 * so the owner can restore it from the moderation panel. Cached audio is
 * purged and a private record is still written to the RemovedStory log.
 */

const ID_PATTERN = /^[a-zA-Z0-9]{5,40}$/;
const REASONS = new Set(["copyright", "hallucination"]);

type RouteContext = { params: Promise<{ id: string }> };

async function isOwnerAuthorized(request: NextRequest): Promise<boolean> {
  // Yeni yetki katmanı: sahip oturumu (owner rolü / sahip e-postası)
  // veya admin Basic Auth (cron/betik yedeği).
  return isAdminAuthorized(request);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return jsonError("Invalid news id.", 400, "INVALID_ID");
  }

  if (!(await isOwnerAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const reason = (body as { reason?: unknown })?.reason;

  if (typeof reason !== "string" || !REASONS.has(reason)) {
    return jsonError(
      "reason must be 'copyright' or 'hallucination'.",
      400,
      "INVALID_REASON",
    );
  }

  const item = await prisma.newsItem.findUnique({ where: { id } });

  if (!item) {
    return jsonError("News item not found.", 404, "NOT_FOUND");
  }

  // İdempotent: zaten kaldırılmışsa başarı döner.
  if (item.removedAt !== null) {
    return NextResponse.json({ success: true });
  }

  // Legacy özel kayıt (audit trail) — satır artık silinmediği için yalnızca
  // ilk kaldırmada yazılır.
  await prisma.removedStory.create({
    data: {
      newsId: item.id,
      title: item.title,
      summary: item.summary,
      reason,
    },
  });

  await prisma.ttsCache.deleteMany({
    where: { cacheKey: { startsWith: `news:${item.id}:` } },
  });

  // Yumuşak kaldırma: public sorgular (removedAt: null filtresi) haberi
  // gizler; owner moderasyon panelinden geri getirebilir.
  await prisma.newsItem.update({
    where: { id: item.id },
    data: {
      removedAt: new Date(),
      removalReason: reason,
      removedBy: "owner",
    },
  });

  return NextResponse.json({ success: true });
}
