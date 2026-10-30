import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

/**
 * Eski portre URL'leri (/portreler/<slug>) → yeni kanonik (/portre/<slug>).
 * slugHistory de kontrol edilir; HTTP 308 kalıcı yönlendirme.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ lang: string; slug: string }> },
) {
  const { lang, slug } = await context.params;

  if (!isLocale(lang)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const portrait =
    (await prisma.portrait.findUnique({
      where: { slug },
      select: { slug: true },
    })) ??
    (await prisma.portrait.findFirst({
      where: { slugHistory: { contains: `"${slug}"` } },
      select: { slug: true },
    }));

  if (!portrait) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(null, {
    status: 308,
    headers: { Location: `/${lang}/portre/${portrait.slug}` },
  });
}
