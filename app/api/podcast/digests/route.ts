import { NextResponse } from "next/server";
import { listDigests } from "@/lib/digest";

export const dynamic = "force-dynamic";

/**
 * FAZ 4.3 — GET /api/podcast/digests
 *
 * Son 14 günün sesli bülten listesi (oynatıcı için).
 * Kişisel veri içermez; herkese açıktır.
 */
export async function GET() {
  const digests = await listDigests(14);

  return NextResponse.json(
    {
      items: digests.map((item) => ({
        id: item.id,
        date: item.date,
        title: item.title,
        body: item.body,
        audioUrl: item.audioUrl,
        audioSeconds: item.audioSeconds,
        status: item.status,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
