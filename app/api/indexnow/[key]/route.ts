import { NextRequest, NextResponse } from "next/server";
import { isIndexNowEnabled } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/**
 * GET /{key}.txt — IndexNow sahiplik doğrulama dosyası.
 *
 * Arama motoru bildirimi kabul etmeden önce bu adresten anahtarı okur.
 * Sadece doğru anahtar isteğine cevap verir; başka her şey 404.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const expected = process.env.INDEXNOW_KEY?.trim();

  if (!expected || !isIndexNowEnabled() || key.replace(/\.txt$/, "") !== expected) {
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
