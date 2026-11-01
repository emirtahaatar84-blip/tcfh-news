import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TagNewsList } from "@/components/feed/TagNewsList";
import { Timeline } from "@/components/content/Timeline";
import { getTimeline } from "@/lib/timeline";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { serializeNewsItem } from "@/lib/news-types";
import { newsByTag } from "@/lib/source-compare";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string; tag: string }> };

/**
 * FAZ 2.3 — Etiket sayfası: /tr/etiket/nvidia
 *
 * Etikete göre haber listesi. Sunucuda kullanıcı verisi tutulmaz.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang: rawLang, tag: rawTag } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const tag = decodeURIComponent(rawTag);
  const dict = await getDictionary(lang);

  return {
    title: `${tag} · ${dict.compare.tagsTitle}`,
    description: `${tag} etiketiyle işaretlenmiş haberler.`,
    alternates: {
      canonical: `/${lang}/etiket/${encodeURIComponent(tag)}`,
      languages: {
        "tr-TR": `/tr/etiket/${encodeURIComponent(tag)}`,
        en: `/en/etiket/${encodeURIComponent(tag)}`,
      },
    },
    robots: { index: true, follow: true },
  };
}

export default async function TagPage({ params }: PageProps) {
  const { lang: rawLang, tag: rawTag } = await params;
  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);
  const tag = decodeURIComponent(rawTag).replace(/^@/, "");

  if (!/^[\p{L}\p{N}-]{2,40}$/u.test(tag)) notFound();

  const { items, total } = await newsByTag(tag, { page: 1, pageSize: 24 });
  const news = items.map(serializeNewsItem);

  // FAZ 3.1 — zaman çizelgesi + "şu ana kadar ne oldu" özeti.
  const timeline = await getTimeline({ kind: "tag", value: tag }, 40);

  return (
    <div className="mx-auto max-w-6xl px-space-3 pb-space-7 pt-space-3 sm:px-space-5">
      <nav aria-label="breadcrumb" className="mb-space-3">
        <ol className="flex items-center gap-space-2 text-[11px] text-zinc-500">
          <li>
            <Link href={`/${lang}`} className="hover:text-zinc-300">
              {dict.breadcrumb.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-zinc-400">
            @{tag}
          </li>
        </ol>
      </nav>

      <header>
        <h1 className="t-h1 text-zinc-100">@{tag}</h1>
        <p className="mt-space-2 text-xs text-zinc-500">
          {total} haber
        </p>
      </header>

      {timeline.total > 1 ? (
        <Timeline
          items={timeline.items}
          digest={timeline.digest}
          locale={lang}
          labels={dict.timeline}
        />
      ) : null}

      <TagNewsList items={news} locale={lang} dict={dict} />
    </div>
  );
}
