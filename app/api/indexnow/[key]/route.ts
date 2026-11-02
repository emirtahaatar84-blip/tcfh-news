import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * IndexNow sahiplik doğrulama dosyası.
 * GET /{INDEXNOW_KEY}.txt → anahtarı döndürür (proxy kökte eşler).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const expected = process.env.INDEXNOW_KEY?.trim();

  if (!expected || key.replace(/\.txt$/, "") !== expected) {
    return new NextResponse("Not found.", { status: 404 });
  }

  return new NextResponse(expected, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
