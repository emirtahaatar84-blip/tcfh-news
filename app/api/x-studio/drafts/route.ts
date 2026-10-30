import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  actorFromRequest,
  auditLog,
  draftCreateSchema,
  isStudioAuthorized,
  serializeDraft,
} from "@/lib/x-studio";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["draft", "copied", "published", "rejected"]);

/**
 * GET /api/x-studio/drafts?status=
 * Havuzdaki taslakları listeler (yeniden eskiye).
 */
export async function GET(request: NextRequest) {
  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const status = new URL(request.url).searchParams.get("status") ?? "";

  const rows = await prisma.xDraft.findMany({
    where: STATUSES.has(status) ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { article: { select: { title: true } }, style: { select: { name: true } } },
  });

  return NextResponse.json(
    { drafts: rows.map(serializeDraft) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/x-studio/drafts
 * Seçilen varyantı havuza kaydeder (status=draft).
 */
export async function POST(request: NextRequest) {
  const actor = actorFromRequest(request);

  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
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

  const parsed = draftCreateSchema.safeParse(body);

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

  const { articleId, styleId, text, hashtags } = parsed.data;

  const article = await prisma.newsItem.findUnique({ where: { id: articleId } });
  if (!article || article.removedAt !== null) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Haber bulunamadı." },
      { status: 404 },
    );
  }

  // Mükerrer engeli: aynı habere daha önce atılan havuz kaydı?
  const existing = await prisma.xDraft.findFirst({
    where: { articleId, status: { in: ["draft", "copied", "published"] } },
    select: { id: true },
  });

  const draft = await prisma.xDraft.create({
    data: {
      articleId,
      styleId,
      variants: JSON.stringify([text]),
      hashtags: JSON.stringify(hashtags),
      charCount: text.length,
      status: "draft",
      createdBy: actor,
    },
    include: { article: { select: { title: true } }, style: { select: { name: true } } },
  });

  auditLog("x-studio.draft.create", actor, {
    draftId: draft.id,
    articleId,
    duplicate: Boolean(existing),
  });

  return NextResponse.json(
    { draft: serializeDraft(draft), duplicateWarning: Boolean(existing) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
