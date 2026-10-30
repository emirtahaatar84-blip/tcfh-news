import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * SIFIR VERİ POLİTİKASI (KVKK): Google OAuth KALDIRILDI ve yeni kayıtlar
 * KAPALI — site kişisel veri toplamaz. Giriş yalnızca mevcut e-posta/şifre
 * hesaplarıyla (site sahibi) yapılır; ziyaretçi deneyimi tamamen anonimdir.
 *
 * .env:
 *   AUTH_SECRET=$(openssl rand -hex 32)
 *   AUTH_URL=http://localhost:3000
 */

/**
 * Google OAuth kaldırıldı (KVKK sıfır veri politikası) — arayüzdeki Google
 * düğmelerini gizlemek için kullanılan bayrak artık daima false.
 */
export const googleOAuthEnabled = false as const;

// ── Güvenlik: üretimde AUTH_SECRET zorunludur ──────────────────────────────
// Güvensiz sabit fallback KALDIRILDI (JWT taklit riski). Derleme aşamasında
// (NEXT_PHASE=phase-production-build) atlanır; üretim ÇALIŞMA ZAMANINDA
// eksik secret instrumentation.ts açılış kontrolüyle sunucuyu düşürür.
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

const isProductionBuild =
  process.env.NEXT_PHASE === "phase-production-build";

if (
  !authSecret &&
  process.env.NODE_ENV === "production" &&
  !isProductionBuild
) {
  throw new Error(
    "AUTH_SECRET zorunludur. Üretim için güvenli bir değer ayarlayın: openssl rand -hex 32",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret ?? "dev-only-insecure-secret",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    // Giriş hataları (ör. farklı Google hesabı engellendi) için Türkçe sayfa.
    error: "/auth-error",
  },
  providers: [
    // E-mail + password sign-in — sıfır veri politikasıyla tek giriş yolu.
    Credentials({
      name: "E-posta",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString() ?? "";

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user?.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * SESSİZ HESAP BİRLEŞTİRME KORUMASI:
     * Oturum açmış bir kullanıcı, kendisine bağlı OLMAYAN bir Google
     * hesabıyla giriş yaparsa Auth.js bunu "yeni hesap bağla" sanıp
     * hesabı mevcut kullanıcıya sessizce ekler (farklı cihazda "yine
     * aynı hesapla açıldı" sorununun nedeni). Bu koruma, bağlı olmayan
     * Google hesabını reddeder; kullanıcı önce çıkış yapmalıdır — böylece
     * farklı Gmail gerçekten AYRI bir kullanıcı olarak açılır.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user?.id) return true; // ilk kez giriş yapan yeni kullanıcı

      const linked = await prisma.account.findFirst({
        where: {
          userId: user.id,
          provider: "google",
          providerAccountId: account.providerAccountId,
        },
        select: { id: true },
      });

      return Boolean(linked);
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      // Rolü oturuma taşı (owner/admin/editor/moderator/user).
      const role = (user as { role?: unknown } | undefined)?.role;
      if (typeof role === "string") token.role = role;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = String(token.uid);
      }
      if (token.role && session.user) {
        session.user.role = String(token.role);
      }
      return session;
    },
  },
});
