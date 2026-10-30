import { NextRequest, NextResponse } from "next/server";
import {
  portraitFallbackSvg,
  queuePortraitImage,
  readPortraitImage,
} from "@/lib/portrait-image";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[a-zA-Z0-9_-]{5,60}$/;

/**
 * GET /api/portraits/:id/image — portrenin TELİFSİZ kapak görseli.
 *
 * - AI üretimi tamamlandıysa: JPEG, immutable cache.
 * - Henüz üretilmediyse: kategori renkleriyle anında SVG fallback;
 *   gerçek görsel arka planda kuyruğa alınır.
 * - Portre yoksa/kaldırılmışsa: 404.
 *
 * Dış kaynak görselleri bu uçtan ASLA servis edilmez.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!ID_PATTERN.test(id)) {
    return new NextResponse("Invalid id.", { status: 400 });
  }

  const existing = await readPortraitImage(id);

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

  const portrait = await prisma.portrait.findUnique({
    where: { id },
    select: {
      title: true,
      category: true,
      subjectType: true,
      status: true,
      removedAt: true,
    },
  });

  if (!portrait || portrait.removedAt || portrait.status === "removed") {
    return new NextResponse("Not found.", { status: 404 });
  }

  try {
    queuePortraitImage({
      id,
      title: portrait.title,
      category: portrait.category,
      subjectType: portrait.subjectType,
    });
  } catch {
    // Kuyruk hatası gösterimi etkilemesin.
  }

  let seed = 0;
  for (let i = 0; i < id.length; i += 1) {
    seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  }

  const svg = portraitFallbackSvg(portrait.category, seed);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Kısa cache: gerçek JPEG hazır olunca bir sonraki yüklemede alınır.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
