import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeftIcon } from "@/components/icons";
import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n-config";

export default async function NotFound() {
  const locale = resolveLocale((await headers()).get("x-locale"));
  const dict = await getDictionary(locale);

  return (
    <div className="flex flex-col items-center justify-center px-space-5 py-space-9 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
        404
      </p>
      <h1 className="t-h1 mt-space-3 text-zinc-50">
        {dict.notFound.title}
      </h1>
      <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-muted">
        {dict.notFound.description}
      </p>
      <Link href={`/${locale}`} className="btn-primary mt-space-5">
        <ArrowLeftIcon className="h-4 w-4" />
        {dict.notFound.back}
      </Link>
    </div>
  );
}
