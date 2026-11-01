import { NextRequest, NextResponse } from "next/server";
import { newsByTag } from "@/lib/source-compare";
import { serializeNewsItem } from "@/lib/news-types";

export const dynamic = "force-dynamic";

/**
 * FAZ 2.3 — GET /api/tags/:tag?page=1&pageSize=20
 *
 * Etikete göre haber listesi (sayfalı, yeniden eskiye).
 * Etiket başta @ olmadan da gönderilebilir.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await context.params;
  const tag = decodeURIComponent(rawTag).trim();

  if (!/^@?[\p{L}\p{N}-]{2,40}$/u.test(tag)) {
    return NextResponse.json({ error: "INVALID_TAG" }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20") || 20;

  const { items, total } = await newsByTag(tag, { page, pageSize });

  return NextResponse.json(
    {
      tag: tag.startsWith("@") ? tag : `@${tag}`,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      items: items.map(serializeNewsItem),
    },
    { headers: { "Cache-Control": "public, max-age=120, s-maxage=120" } },
  );
}
