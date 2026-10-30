import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ContentArticle } from "@/components/content/ContentArticle";
import { OfflineSaver } from "@/components/OfflineSaver";
import { buildSpeechBundle, getNewsContent } from "@/lib/content";
import { contentJsonLd, contentMetadata } from "@/lib/content-seo";
import { estimateSeconds } from "@/lib/speech-text";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const content = await getNewsContent(lang, slug);

  if (!content) return { title: undefined, robots: { index: false, follow: false } };

  return contentMetadata(content, lang);
}

export default async function NewsPage({ params }: PageProps) {
  const { lang: rawLang, slug } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const [dict, content, viewer] = await Promise.all([
    getDictionary(lang),
    getNewsContent(lang, slug),
    getViewer(lang),
  ]);

  if (!content) notFound();

  // Eksik slug'lı eski kayıt: kanonik adrese kalıcı yönlendir.
  if (content.slug !== slug) {
    permanentRedirect(`/${lang}/haber/${content.slug}`);
  }

  const bundle = buildSpeechBundle(content, lang);
  const listen = Math.max(
    1,
    Math.round(estimateSeconds(bundle.full.sentences.join(" ")) / 60),
  );

  const { article, breadcrumb } = contentJsonLd(content, lang);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <OfflineSaver url={`/${lang}/haber/${slug}`} />
      <ContentArticle
        content={content}
        lang={lang}
        dict={dict}
        speechBundle={bundle}
        listenMinutes={listen}
        canModerate={viewer.isOwner}
      />
    </>
  );
}
