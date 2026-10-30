import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";

/**
 * Cron uç noktaları için yetkilendirme.
 *
 * İki yol:
 *   1. `?key=` sorgu parametresi → CRON_SECRET_KEY (zamanlama sabit karşılaştırma)
 *   2. Owner oturumu / admin kimlik bilgisi (isAdminAuthorized)
 */
export async function isCronAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET_KEY?.trim();

  if (secret) {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const keyBuffer = Buffer.from(key, "utf8");
    const secretBuffer = Buffer.from(secret, "utf8");

    if (
      keyBuffer.length === secretBuffer.length &&
      timingSafeEqual(keyBuffer, secretBuffer)
    ) {
      return true;
    }
  }

  return isAdminAuthorized(request);
}
