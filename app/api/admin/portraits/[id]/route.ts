import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/portraits/[id] (owner)
 *
 * Gövde: { action: "publish" | "review" | "remove" | "restore", reason?: string }
 *
 * Portre moderasyonu: yayınla, incelemeye al, kaldır (Uyar-Kaldır) veya
 * geri getir. Kaldırma yumuşaktır (removedAt) — kayıt silinmez.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const { id } = await context.params;

  let action = "";
  let reason = "";

  try {
    const body = (await request.json()) as { action?: unknown; reason?: unknown };
    if (typeof body.action === "string") action = body.action;
    if (typeof body.reason === "string") reason = body.reason.slice(0, 500);
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const now = new Date();

  const data =
    action === "publish"
      ? { status: "published", publishedAt: now, removedAt: null, removalReason: null }
      : action === "review"
        ? { status: "review", publishedAt: null }
        : action === "remove"
          ? { status: "removed", removedAt: now, removalReason: reason || "Owner tarafından kaldırıldı." }
          : action === "restore"
            ? { status: "published", removedAt: null, removalReason: null }
            : null;

  if (!data) {
    return NextResponse.json(
      { error: "INVALID_ACTION", message: "action: publish | review | remove | restore" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.portrait.update({
      where: { id },
      data,
      select: { id: true, slug: true, status: true, publishedAt: true },
    });

    return NextResponse.json(
      {
        success: true,
        portrait: {
          id: updated.id,
          slug: updated.slug,
          status: updated.status,
          publishedAt: updated.publishedAt?.toISOString() ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
