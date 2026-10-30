import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, AlertTriangleIcon } from "@/components/icons";
import { isLocale, type Locale } from "@/lib/i18n-config";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth.js hata sayfası (/auth-error?error=... → locale yönlendirmesiyle
 * /{lang}/auth-error). Sessiz hesap birleştirme koruması reddedildiğinde
 * veya OAuth akışı hata verdiğinde Türkçe açıklama gösterir.
 */
export default async function AuthErrorPage({ params, searchParams }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const resolved = await searchParams;
  const error = Array.isArray(resolved.error) ? resolved.error[0] : resolved.error;

  let title = "Giriş tamamlanamadı";
  let description =
    "Giriş sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";

  if (error === "AccessDenied") {
    title = "Bu Google hesabı bu oturuma bağlı değil";
    description =
      "Seçtiğiniz Google hesabı, açık olan oturumun hesabından farklı. " +
      "Farklı bir hesapla devam etmek için önce sağ üstteki çıkış düğmesiyle " +
      "oturumu kapatın, sonra yeniden giriş yapın.";
  } else if (error === "OAuthAccountNotLinked") {
    title = "Bu e-posta başka bir yöntemle kayıtlı";
    description =
      "Bu e-posta adresi farklı bir giriş yöntemiyle (Google / e-posta-şifre) " +
      "ilişkili. Lütfen önce çıkış yapıp kayıtlı olduğunuz yöntemle giriş yapın.";
  } else if (error === "Verification") {
    title = "Doğrulama başarısız";
    description = "Giriş bağlantısının süresi dolmuş olabilir. Yeniden deneyin.";
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-space-5 py-space-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
        <AlertTriangleIcon className="h-6 w-6" />
      </span>

      <h1 className="t-h1 mt-space-5 max-w-md text-zinc-100">{title}</h1>
      <p className="mt-space-2 max-w-md text-sm leading-relaxed text-zinc-500">
        {description}
      </p>

      <Link
        href={`/${lang}`}
        className="mt-space-6 inline-flex items-center gap-space-2 text-sm text-zinc-400 transition hover:text-zinc-100"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Akışa dön
      </Link>
    </div>
  );
}
