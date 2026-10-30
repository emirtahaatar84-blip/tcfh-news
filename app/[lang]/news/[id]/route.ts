import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

/**
 * Eski haber URL'leri (/news/<id>) → yeni kanonik (/haber/<slug>).
 * Route handler kullanılır: HTTP 308 döner (SEO değeri korunur).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ lang: string; id: string }> },
) {
  const { lang, id } = await context.params;

  if (!isLocale(lang)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const item = await prisma.newsItem.findUnique({
    where: { id },
    select: { slug: true, removedAt: true },
  });

  if (!item || item.removedAt || !item.slug) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Göreli Location: konteyner içi host (0.0.0.0:3000) sızmasın.
  return new NextResponse(null, {
    status: 308,
    headers: { Location: `/${lang}/haber/${item.slug}` },
  });
}
