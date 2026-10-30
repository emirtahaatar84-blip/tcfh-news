import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fallbackSvg, queueNewsImage, readNewsImage } from "@/lib/imagegen";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[a-zA-Z0-9]{5,40}$/;

/**
 * GET /api/news/:id/image — haberin telifsiz görseli.
 *
 * - AI üretimi tamamlandıysa: JPEG, immutable cache ile.
 * - Henüz üretilmediyse: kategori renkleriyle anında SVG fallback +
 *   arka planda üretim kuyruğa alınır (bir sonraki yüklemede gerçek görsel).
 * - Haber yoksa/kaldırılmışsa: 404 (varlık sızmaz).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return new NextResponse("Invalid id.", { status: 400 });
  }

  const existing = await readNewsImage(id);

  if (existing) {
    return new NextResponse(new Uint8Array(existing.data), {
      status: 200,
      headers: {
        "Content-Type": existing.mime,
        "Content-Length": String(existing.data.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const item = await prisma.newsItem.findUnique({
    where: { id },
    select: { title: true, category: true, removedAt: true },
  });

  if (!item || item.removedAt) {
    return new NextResponse("Not found.", { status: 404 });
  }

  // Gerçek görseli arka planda üret — fallback şimdi servis edilir.
  try {
    queueNewsImage(id, item.title, item.category);
  } catch {
    // Kuyruk hatası gösterimi etkilemesin.
  }

  let seed = 0;
  for (let i = 0; i < id.length; i += 1) {
    seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  }

  const svg = fallbackSvg(item.category, seed);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=120",
    },
  });
}
