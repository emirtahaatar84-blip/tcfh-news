import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { EmailText } from "@/components/EmailText";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
};

/**
 * Hakkımızda sayfası — AdSense onayı ve ziyaretçi şeffaflığı için
 * platformun nasıl çalıştığını açıklar.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return { title: dict.legal.about.title };
}

export default async function AboutPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);
  const content = dict.legal.about;

  return (
    <div className="px-space-3 pb-space-7 pt-space-4 sm:px-space-5">
      <div className="measure">
        <Link
          href={`/${lang}`}
          className="inline-flex items-center gap-space-2 text-sm text-zinc-400 transition hover:text-zinc-100"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {dict.common.backToFeed}
        </Link>

        <h1 className="t-h1 mt-space-4 text-zinc-100">
          {content.title}
        </h1>
        <p className="mt-space-1 text-xs text-zinc-500">{content.updated}</p>

        <div className="block-stack mt-space-6">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-sm font-bold text-zinc-200">
                {section.heading}
              </h2>
              <div className="mt-space-2 space-y-space-3">
                {section.body.map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-sm leading-relaxed text-zinc-400"
                  >
                    <EmailText text={paragraph} />
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
