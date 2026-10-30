import { cookies } from "next/headers";
import { auth } from "@/lib/next-auth";
import { isOwner } from "@/lib/owner";
import type { Locale } from "@/lib/i18n-config";

/**
 * Görüntüleyici durumu — ÇEREZSİZ ziyaretçi için Auth.js hiç çalıştırılmaz.
 *
 * Auth.js oturum ucu ilk çağrıda `authjs.csrf-token` gibi çerezler
 * yazabildiği için, genel sayfalarda oturum kontrolü yalnızca zaten bir
 * oturum çerezi varsa yapılır. Anonim ziyaretçide hiçbir çerez oluşmaz.
 */
export type Viewer = {
  isOwner: boolean;
};

export async function getViewer(_lang?: Locale): Promise<Viewer> {
  const store = await cookies();
  const hasSessionCookie = store
    .getAll()
    .some(
      (cookie) =>
        cookie.name === "authjs.session-token" ||
        cookie.name === "__Secure-authjs.session-token",
    );

  if (!hasSessionCookie) return { isOwner: false };

  const session = await auth();
  const user = session?.user;

  return {
    isOwner: Boolean(
      user && (user.role === "owner" || isOwner(user.email)),
    ),
  };
}
