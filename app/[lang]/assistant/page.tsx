import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  return {
    title: dict.sidebar.nav.assistant,
    description: dict.assistant.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function AssistantPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <AssistantChat lang={lang} labels={dict.assistant} />
    </div>
  );
}
