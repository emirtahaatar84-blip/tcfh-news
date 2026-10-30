import { timingSafeEqual } from "crypto";
import { hasValidAdminSession } from "@/lib/admin-session";
import { auth } from "@/lib/next-auth";
import { isOwnerEmail } from "@/lib/roles";

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Yönetim yetkisi (sırayla):
 *  1. 'owner' rolüne sahip oturum — panel sayfaları ve API'lerin birincil yolu
 *  2. HttpOnly admin oturum çerezi (eski Basic Auth akakından kalan)
 *  3. HTTP Basic Auth — cron ve betikler için yedek
 */
export async function isAdminAuthorized(request: Request): Promise<boolean> {
  // 1) Sahip oturumu (Google veya e-posta/şifre ile giriş)
  const session = await auth();
  if (await isOwnerEmail(session?.user?.email)) return true;

  // 2/3) Basic Auth yedekleri (cron / harici betikler)
  if (hasValidAdminSession(request)) return true;

  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return false;

  const expectedUser = process.env.ADMIN_USER || "admin";
  const header = request.headers.get("authorization");

  if (!header || !header.toLowerCase().startsWith("basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  return safeCompare(user, expectedUser) && safeCompare(password, expectedPassword);
}
