import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

/** Eski "Keşfet" sayfası → Kategoriler (308 kalıcı yönlendirme). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ lang: string }> },
) {
  const { lang } = await context.params;
  const target = isLocale(lang) ? lang : "tr";

  return new NextResponse(null, {
    status: 308,
    headers: { Location: `/${target}/kategoriler` },
  });
}
