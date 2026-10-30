import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/owner";

/**
 * Rol sistemi: owner > admin > editor > moderator > user.
 * Yeni kayıtlar şema varsayılanıyla otomatik 'user' olur; yalnızca
 * 'owner' rolü yönetim panelini ve X Stüdyo'yu görebilir.
 */

export const ROLES = [
  "owner",
  "admin",
  "editor",
  "moderator",
  "user",
] as const;

export type Role = (typeof ROLES)[number];

/** DB'den kullanıcının rolünü okur; kullanıcı yoksa null döner. */
export async function getUserRole(
  email: string,
): Promise<Role | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { role: true },
  });

  return (user?.role as Role | undefined) ?? null;
}

/**
 * Owner yetkisi: DB rolü 'owner' VEYA sahip e-posta listesi.
 * E-posta fallback'i, rol güncellemesi yapılmadan da sahibin
 * kilitlenmemesini garantiler.
 */
export async function isOwnerEmail(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  if (isOwner(email)) return true;

  const role = await getUserRole(email);
  return role === "owner";
}
