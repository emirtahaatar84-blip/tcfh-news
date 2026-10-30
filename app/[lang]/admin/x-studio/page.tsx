import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { XStudio } from "@/components/xstudio/XStudio";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string }> };

/** /tr/admin/x-studio — X (Twitter) post üretim atölyesi (Basic Auth korumalı). */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.xstudio.title,
    robots: { index: false, follow: false },
  };
}

export default async function XStudioPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;

  const [dict, styles] = await Promise.all([
    getDictionary(lang),
    prisma.xStyle.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <XStudio
      lang={lang}
      styles={styles.map((style) => ({
        id: style.id,
        slug: style.slug,
        name: style.name,
        emojiLevel: style.emojiLevel,
        maxEmoji: style.maxEmoji,
      }))}
      dict={dict.xstudio}
    />
  );
}
