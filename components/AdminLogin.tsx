"use client";

import Link from "next/link";
import { ArrowLeftIcon, ShieldIcon } from "@/components/icons";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  googleEnabled: boolean;
  labels: {
    title: string;
    prompt: string;
    signIn: string;
    notConfigured: string;
    back: string;
  };
};

/**
 * Yönetim alanı giriş ekranı: yalnızca 'owner' rolündeki hesap
 * panele ve X Stüdyo'ya erişebilir. Diğer kullanıcılar akışa döner.
 */
export function AdminLogin({ lang, googleEnabled, labels }: Props) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-space-5 py-space-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/10 text-blue-400">
        <ShieldIcon className="h-6 w-6" />
      </span>

      <h1 className="t-h1 mt-space-5 text-zinc-100">
        {labels.title}
      </h1>
      <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-zinc-500">
        {labels.prompt}
      </p>

      <div className="mt-space-5 w-full max-w-xs">
        <GoogleLoginButton
          label={labels.signIn}
          disabled={!googleEnabled}
          notConfiguredNote={labels.notConfigured}
          redirectTo={`/${lang}/admin`}
        />
      </div>

      <Link
        href={`/${lang}`}
        className="mt-space-6 inline-flex items-center gap-space-2 text-sm text-zinc-400 transition hover:text-zinc-100"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {labels.back}
      </Link>
    </div>
  );
}
