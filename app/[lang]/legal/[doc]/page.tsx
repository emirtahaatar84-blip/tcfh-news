import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { EmailText } from "@/components/EmailText";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string; doc: string }>;
};

const DOCS = ["kvkk", "cookies", "terms", "copyright", "about"] as const;

type DocKey = (typeof DOCS)[number];

function isDoc(value: string): value is DocKey {
  return (DOCS as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang, doc } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";

  if (!isDoc(doc)) return {};

  const dict = await getDictionary(lang);
  return { title: dict.legal[doc].title };
}

export default async function LegalPage({ params }: PageProps) {
  const { lang: rawLang, doc } = await params;

  if (!isLocale(rawLang) || !isDoc(doc)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);
  const content = dict.legal[doc];

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
              <h2 className="text-[15px] font-bold text-zinc-100">
                {section.heading}
              </h2>
              {section.body.map((paragraph, index) => (
                <p
                key={index}
                className="mt-space-2 text-[15px] leading-relaxed text-zinc-200"
              >
                <EmailText text={paragraph} />
              </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
