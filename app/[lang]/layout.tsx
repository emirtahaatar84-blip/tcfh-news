import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InstallPrompt } from "@/components/InstallPrompt";
import { StorageNotice } from "@/components/DevicePrefsProvider";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { MediaBar } from "@/components/media/MediaBar";
import { MediaProvider } from "@/components/media/MediaProvider";
import { ScrollToTop } from "@/components/ScrollToTop";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { getViewer } from "@/lib/viewer";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

function siteUrl(): URL {
  try {
    return new URL(process.env.SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const [dict, settings] = await Promise.all([
    getDictionary(lang),
    getSettings(),
  ]);

  return {
    metadataBase: siteUrl(),
    title: {
      default: settings.siteName,
      template: `%s · ${settings.siteName}`,
    },
    description: dict.meta.description,
    keywords: dict.meta.keywords,
    applicationName: settings.siteName,
    alternates: {
      canonical: `/${lang}`,
      languages: { "tr-TR": "/tr", en: "/en", "x-default": "/tr" },
    },
    openGraph: {
      type: "website",
      siteName: settings.siteName,
      title: settings.siteName,
      description: dict.meta.description,
      locale: lang === "tr" ? "tr_TR" : "en_US",
      url: `/${lang}`,
    },
    twitter: {
      card: "summary",
      title: settings.siteName,
      description: dict.meta.description,
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;

  // Yönetim alanı kendi tam genişlikli düzenini kullanır.
  if ((await headers()).get("x-admin-page") === "1") {
    return (
      <div className="min-h-screen bg-[#0b0c0f] text-zinc-100">{children}</div>
    );
  }

  const [dict, settings, viewer] = await Promise.all([
    getDictionary(lang),
    getSettings(),
    getViewer(lang),
  ]);

  const ownerUser = viewer.isOwner;

  return (
    <MediaProvider>
      {/* FAZ 3.3 — RSS/Atom autodiscovery. Metadata alternates'i hreflang
          tarafından kullanıldığı için doğrudan head'e yazılır. */}
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml" />
      <link rel="alternate" type="application/atom+xml" title="Atom" href="/atom.xml" />
      <div className="flex min-h-screen flex-col bg-[#0e0f12]">
        <a href="#main-content" className="skip-link">
          {dict.accessibility.skipToContent}
        </a>

        <SiteHeader
          lang={lang}
          siteName={settings.siteName}
          labels={{
            feed: dict.navMain.feed,
            categories: dict.navMain.categories,
            portraits: dict.navMain.portraits,
            news: dict.navMain.news,
            podcast: dict.navMain.podcast,
            blog: dict.navMain.blog,
            search: dict.navMain.search,
            saved: dict.navMain.saved,
            debate: dict.shell.debate,
            admin: dict.header.admin,
            theme: dict.theme,
            density: {
              density: dict.preferences.density,
              densityGroup: dict.preferences.densityGroup,
              densityHint: dict.preferences.densityHint,
              densityAuto: dict.preferences.densityAuto,
              densityResetAuto: dict.preferences.densityResetAuto,
              densityCompactHint: dict.preferences.densityCompactHint,
              densityBalancedHint: dict.preferences.densityBalancedHint,
              densityComfortableHint: dict.preferences.densityComfortableHint,
            },
          }}
          showAdminLink={ownerUser}
        />

        <StorageNotice />

        <main id="main-content" tabIndex={-1} className="main-shell flex-1 lg:pb-space-0">
          <InstallPrompt labels={dict.pwa} />
          {children}
        </main>

        <SiteFooter
          lang={lang}
          siteName={settings.siteName}
          labels={{
            rights: dict.footer.rights,
            contact: dict.footer.contact,
            links: dict.footer.links,
            noCookies: dict.footer.noCookies,
            language: dict.language.switch,
          }}
        />

        <MobileNav
          lang={lang}
          labels={{
            feed: dict.navMain.feed,
            categories: dict.navMain.categories,
            search: dict.navMain.search,
            saved: dict.navMain.saved,
            savedShort: dict.navMain.savedShort,
            debate: dict.shell.debate,
          }}
        />

        <GlobalSearch lang={lang} labels={dict.search} />
        <ScrollToTop label={dict.common.backToTop} />
        <MediaBar labels={dict.media} />
      </div>
    </MediaProvider>
  );
}
