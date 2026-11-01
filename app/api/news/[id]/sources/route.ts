import { NextRequest, NextResponse } from "next/server";
import { getSourceComparison } from "@/lib/source-compare";

export const dynamic = "force-dynamic";

/**
 * FAZ 2.2 — GET /api/news/:id/sources
 *
 * Haberin kaynaklarını karşılaştırma biçiminde döndürür:
 * { name, url, headline, brief, overlap }
 *
 * Açık uç: kimlik doğrulaması gerekmez, kişisel veri içermez.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!/^[a-zA-Z0-9_-]{5,60}$/.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const result = await getSourceComparison(id);

  if (!result) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
