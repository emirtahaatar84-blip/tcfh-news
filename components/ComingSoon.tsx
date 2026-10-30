import Link from "next/link";
import { SparklesIcon } from "@/components/icons";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  title: string;
  description: string;
  backLabel: string;
};

/** Shared placeholder for sections that are not implemented yet. */
export function ComingSoon({ lang, title, description, backLabel }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-space-5 py-space-9 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
        <SparklesIcon className="h-6 w-6" />
      </span>
      <h1 className="t-h1 mt-space-5 text-zinc-50">
        {title}
      </h1>
      <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-zinc-400">
        {description}
      </p>
      <Link href={`/${lang}`} className="btn-primary mt-space-5">
        {backLabel}
      </Link>
    </div>
  );
}
