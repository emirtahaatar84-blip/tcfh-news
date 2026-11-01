import { NextResponse } from "next/server";
import { listTags } from "@/lib/source-compare";

export const dynamic = "force-dynamic";

/**
 * FAZ 2.3 — GET /api/tags
 *
 * Kullanılan konu etiketleri ve haber sayıları. Aramada öneri olarak kullanılır.
 */
export async function GET() {
  const tags = await listTags(60);

  return NextResponse.json(
    { tags },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
