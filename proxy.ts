import { NextRequest, NextResponse } from "next/server";
import { locales, type Locale } from "@/lib/i18n-config";

const DEFAULT_LOCALE = "tr";

function configuredDefaultLocale(): Locale {
  const value = process.env.DEFAULT_LOCALE;
  return (locales as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

/**
 * Yerel yönlendirme proxy'si.
 *
 * NOT: /admin sayfaları artık HTTP Basic Auth ile değil, sahip (owner)
 * Google oturumuyla korunur — kontrol app/[lang]/admin/layout.tsx içinde
 * sunucu tarafında yapılır. API rotaları kendi yetki kontrollerini
 * yapar (lib/auth.ts → isAdminAuthorized).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // IndexNow sahiplik dosyası kökte istenir: /{KEY}.txt
  const indexNowKey = process.env.INDEXNOW_KEY?.trim();
  if (indexNowKey && pathname === `/${indexNowKey}.txt`) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/indexnow/${indexNowKey}`;
    return NextResponse.rewrite(url);
  }

  // API rotaları kendi yetkilerini yönetir.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // FAZ 3.2 — RSS / Atom / sitemap / robots DİLE BAĞLI DEĞİLDİR.
  // Önceden /rss/Ekonomi → /tr/rss/Ekonomi yönlendiriliyordu ve 404 veriyordu.
  if (
    pathname === "/rss.xml" ||
    pathname === "/atom.xml" ||
    pathname === "/sitemap.xml" ||
    pathname === "/news-sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/rss/")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale = (locales as readonly string[]).includes(firstSegment ?? "");

  if (!hasLocale) {
    // KVKK: çerez kullanılmaz. Dil yalnızca URL'den veya sunucu
    // varsayılanından belirlenir; tarayıcıya hiçbir çerez yazılmaz.
    const locale = configuredDefaultLocale();

    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const locale = firstSegment as Locale;
  const isAdminPage = segments[1] === "admin";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);
  // Yönetim sayfaları genel akışın 3 kolonlu temasına girmez; [lang]
  // layout'u bu başlıkla admin'i tam genişlikli kendi düzenine ayırır.
  if (isAdminPage) {
    requestHeaders.set("x-admin-page", "1");
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-locale", locale);
  response.headers.set("Content-Language", locale);

  if (isAdminPage) {
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\..*).*)",
    // IndexNow sahiplik dosyası: /{KEY}.txt — uzantı filtresini atlar.
    "/:key([a-zA-Z0-9-]{8,128}).txt",
  ],
};
