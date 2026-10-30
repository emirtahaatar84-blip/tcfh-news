import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { runCitationAudit } from "@/lib/citation-audit";

export const dynamic = "force-dynamic";

/**
 * İŞ 4.5 — Atıf denetim paneli.
 *
 * GET  → son 50 atıf (başlıklarla birlikte) + kara liste.
 * DELETE ?id=... → atıfı kaldır (kayıt silinir, gövdeden bağlantı düşer).
 * POST { id, blacklist?: true } → atıfı yanlış işaretle ve isteğe bağlı
 *        olarak çifti kara listeye al (bir daha eşleşmez).
 */

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const [citations, blacklist] = await Promise.all([
    prisma.citation.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.citationBlacklist.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  // Başlıkları tek sorguda topla (içerik bazlı; kullanıcı verisi yok).
  const newsIds = citations.flatMap((item) => [
    item.fromKind === "haber" ? item.fromId : null,
    item.toKind === "haber" ? item.toId : null,
  ]).filter((id): id is string => Boolean(id));

  const titles = new Map<string, string>();
  if (newsIds.length > 0) {
    const rows = await prisma.newsItem.findMany({
      where: { id: { in: newsIds } },
      select: { id: true, title: true },
    });
    for (const row of rows) titles.set(row.id, row.title);
  }

  return NextResponse.json(
    {
      citations: citations.map((item) => ({
        id: item.id,
        fromKind: item.fromKind,
        fromId: item.fromId,
        fromTitle: titles.get(item.fromId) ?? item.fromId,
        toKind: item.toKind,
        toId: item.toId,
        toTitle: titles.get(item.toId) ?? item.toId,
        score: item.score,
        anchor: item.anchor,
        entities: JSON.parse(item.entities || "[]"),
        reviewed: item.reviewed,
        createdAt: item.createdAt.toISOString(),
      })),
      blacklist,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id gerekli.", 400, "INVALID_ID");

  await prisma.citation.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Geçersiz JSON.", 400);
  }

  const input = body as { id?: unknown; blacklist?: unknown };
  if (typeof input.id !== "string") return jsonError("id gerekli.", 400);

  const citation = await prisma.citation.findUnique({ where: { id: input.id } });
  if (!citation) return jsonError("Atıf bulunamadı.", 404);

  // Denetim Kaydı: "aksiyon: haftalık denetim tetikle"
  const action = (body as { action?: unknown }).action;
  if (action === "audit") {
    const report = await runCitationAudit();
    return NextResponse.json({ success: true, report }, { headers: { "Cache-Control": "no-store" } });
  }

  await prisma.citation.update({ where: { id: citation.id }, data: { reviewed: 0 } });

  if (input.blacklist === true) {
    await prisma.citationBlacklist
      .upsert({
        where: {
          fromKind_fromId_toKind_toId: {
            fromKind: citation.fromKind,
            fromId: citation.fromId,
            toKind: citation.toKind,
            toId: citation.toId,
          },
        },
        update: { reason: "editör: yanlış atıf" },
        create: {
          fromKind: citation.fromKind,
          fromId: citation.fromId,
          toKind: citation.toKind,
          toId: citation.toId,
          reason: "editör: yanlış atıf",
        },
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
