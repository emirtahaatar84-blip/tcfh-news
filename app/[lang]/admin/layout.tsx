import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminLogin } from "@/components/AdminLogin";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { auth, googleOAuthEnabled } from "@/lib/next-auth";
import { isOwnerEmail } from "@/lib/roles";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ lang: string }>;

};

/**
 * Yönetim alanı kapısı: yalnızca 'owner' rolüne sahip oturum
 * (sahip Google/e-posta hesabı) paneli ve X Stüdyo'yu görebilir.
 * Diğer tüm kullanıcılar giriş ekranına düşer; akış herkese açıktır.
 */
export default async function AdminLayout({ children, params }: LayoutProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;

  const [session, dict] = await Promise.all([
    auth(),
    getDictionary(lang),
  ]);

  if (!(await isOwnerEmail(session?.user?.email))) {
    return (
      <AdminLogin
        lang={lang}
        googleEnabled={googleOAuthEnabled}
        labels={{
          title: dict.admin.loginTitle,
          prompt: dict.admin.loginPrompt,
          signIn: dict.auth.googleLogin,
          notConfigured: dict.auth.notConfigured,
          back: dict.common.backToFeed,
        }}
      />
    );
  }

  return <>{children}</>;
}
