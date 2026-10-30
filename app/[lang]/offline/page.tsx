import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n-config";

type PageProps = { params: Promise<{ lang: string }> };

export const metadata: Metadata = {
  title: "Çevrimdışı",
  robots: { index: false, follow: false },
};

/**
 * Çevrimdışı fallback sayfası. Service worker navigasyon isteklerini
 * başarısız olduğunda buraya yönlendirir — bu yüzden statik sunulur ve
 * "Tekrar Dene" düğmesi JS gerektirmeyen düz bir <a> bağlantısıdır.
 */
export default async function OfflinePage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang = rawLang;
  const dict = await getDictionary(lang);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-space-5 py-space-8 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-10 w-10 text-zinc-600"
      >
        <path d="M8.5 8.5a5.5 5.5 0 0 0 7.6 7.6" />
        <path d="M17.7 13.4A5.5 5.5 0 0 0 8 6.3" />
        <path d="M3 3l18 18" />
      </svg>
      <h1 className="t-h1 mt-space-4 text-zinc-50">
        {dict.pwa.offline}
      </h1>
      <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-zinc-400">
        {dict.pwa.offlineBody}
      </p>
      <a href={`/${lang}`} className="btn-primary mt-space-5">
        {dict.pwa.retry}
      </a>
    </div>
  );
}
