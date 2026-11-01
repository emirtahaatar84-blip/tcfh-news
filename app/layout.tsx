import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@/app/generated/tokens.css";
import "@/app/globals.css";
import { DevicePrefsProvider } from "@/components/DevicePrefsProvider";
import { PWARegister } from "@/components/PWARegister";
import { resolveLocale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TCFH News",
  // Erken akış (streaming) sırasında da bulunması için kök açıklama.
  description:
    "3 bağımsız kaynakla doğrulanmış, yapay zekâ ile sentezlenmiş tarafsız haber akışı. Münazara dosyaları, portreler ve sesli özetler.",
  robots: { index: true, follow: true },
  // Google Search Console doğrulaması — kaldırılmamalı.
  verification: {
    google: "vdfXbd6iFibWAyvtMZfDdu4crjmatIaPfFG7EXLjZTk",
  },
  manifest: "/manifest.webmanifest",

  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "Haber",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e0f12" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

/**
 * Tema FOUC (flash) önleme: React hidrasyonundan ÖNCE, ilk boyamada
 * <html data-theme> doğru değere ayarlanır. localStorage okunamazsa
 * sistem tercihine düşer. Hiçbir veri dışarı gönderilmez.
 */
const THEME_BOOTSTRAP = `(function(){try{var raw=localStorage.getItem("eth.v1.prefs");var p=raw?JSON.parse(raw):null;var t=(p&&p.theme)||"system";var d=t==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;var r=document.documentElement;r.dataset.theme=d;r.style.colorScheme=d;var pref=(p&&p.density)||"auto";var auto=window.innerWidth<768?"comfortable":(window.innerWidth<1180?"balanced":"balanced");r.dataset.density=(pref==="auto"||!pref)?auto:pref;if(p){r.dataset.fontSize=p.fontSize||"md";r.dataset.lineHeight=p.lineHeight||"normal";r.dataset.readingMode=p.readingMode?"on":"off";}}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.dataset.density="comfortable";}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveLocale((await headers()).get("x-locale"));

  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen font-sans">
        {/*
          Not: e-posta adresleri <EmailText> ile ayrı metin düğümleri olarak
          render edilir; Cloudflare gizlemesi devre dışı kalır.
        */}
        <DevicePrefsProvider>{children}</DevicePrefsProvider>
        <PWARegister />
      </body>
    </html>
  );
}
