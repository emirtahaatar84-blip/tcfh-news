import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  actorFromRequest,
  auditLog,
  draftPatchSchema,
  isStudioAuthorized,
  serializeDraft,
} from "@/lib/x-studio";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/x-studio/drafts/:id
 * Taslak durumu güncelle (copied | published | rejected | draft).
 * copied/published geçişlerinde zaman damgası otomatik atılır.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = actorFromRequest(request);

  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!/^[a-zA-Z0-9]{5,40}$/.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Geçersiz taslak kimliği." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = draftPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Gövde doğrulanamadı.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const existing = await prisma.xDraft.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Taslak bulunamadı." },
      { status: 404 },
    );
  }

  const { status, externalUrl } = parsed.data;

  const draft = await prisma.xDraft.update({
    where: { id },
    data: {
      status,
      externalUrl: externalUrl ?? existing.externalUrl,
      ...(status === "copied" ? { copiedAt: new Date() } : {}),
      ...(status === "published" ? { publishedAt: new Date() } : {}),
    },
    include: { article: { select: { title: true } }, style: { select: { name: true } } },
  });

  auditLog("x-studio.draft.status", actor, {
    draftId: id,
    from: existing.status,
    to: status,
  });

  return NextResponse.json(
    { draft: serializeDraft(draft) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
