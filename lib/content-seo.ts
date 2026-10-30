import type { Metadata } from "next";
import type { ContentItem } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import type { Locale } from "@/lib/i18n-config";

/**
 * İçerik sayfaları için ortak SEO üretimi:
 * canonical, hreflang, OG/Twitter, NewsArticle + BreadcrumbList + Speakable.
 */

export function siteBase(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function contentMetadata(
  content: ContentItem,
  lang: Locale,
): Metadata {
  const path = content.kind === "portre" ? "portre" : "haber";
  const canonical = `/${lang}/${path}/${content.slug}`;
  const image = content.coverImageUrl
    ? content.coverImageUrl.startsWith("http")
      ? content.coverImageUrl
      : `${siteBase()}${content.coverImageUrl}`
    : undefined;

  return {
    title: content.title,
    description: content.subtitle ?? undefined,
    alternates: {
      canonical,
      languages: {
        "tr-TR": `/tr/${path}/${content.slug}`,
        en: `/en/${path}/${content.slug}`,
      },
    },
    openGraph: {
      type: "article",
      title: content.title,
      description: content.subtitle ?? undefined,
      publishedTime: content.publishedAt ?? undefined,
      modifiedTime: content.updatedAt ?? undefined,
      locale: lang === "tr" ? "tr_TR" : "en_US",
      url: canonical,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.subtitle ?? undefined,
      images: image ? [image] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export function contentJsonLd(content: ContentItem, lang: Locale) {
  const base = siteBase();
  const path = content.kind === "portre" ? "portre" : "haber";
  const url = `${base}/${lang}/${path}/${content.slug}`;
  const inLanguage = lang === "tr" ? "tr-TR" : "en";

  const article = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: content.title,
    description: content.subtitle ?? undefined,
    datePublished: content.publishedAt ?? undefined,
    dateModified: content.updatedAt ?? content.publishedAt ?? undefined,
    inLanguage,
    articleSection: content.category,
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: content.coverImageUrl
      ? [
          content.coverImageUrl.startsWith("http")
            ? content.coverImageUrl
            : `${base}${content.coverImageUrl}`,
        ]
      : undefined,
    author: { "@type": "Organization", name: "TCFH News", url: base },
    publisher: { "@type": "Organization", name: "TCFH News", url: base },
    citation: content.sources.map((source) => ({
      "@type": "CreativeWork",
      name: source.title || source.name,
      url: source.url || undefined,
      datePublished: source.publishedAt ?? undefined,
    })),
    // Sesli okuma: başlık + tek cümle özet konuşulabilir olarak işaretlenir.
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".speakable-summary"],
    },
    ...(content.subjectType === "kisi" && content.subjectName
      ? {
          about: {
            "@type": "Person",
            name: content.subjectName,
          },
        }
      : content.subjectType === "kurum" && content.subjectName
        ? {
            about: {
              "@type": "Organization",
              name: content.subjectName,
            },
          }
        : {}),
  } as Record<string, unknown>;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: lang === "tr" ? "Ana Sayfa" : "Home",
        item: `${base}/${lang}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: content.category,
        item: `${base}/${lang}/kategori/${encodeURIComponent(content.category)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: content.title,
        item: url,
      },
    ],
  };

  return { article, breadcrumb };
}

export function methodDate(value: string | null, lang: Locale): string {
  return value ? formatDate(value, lang) : "";
}
