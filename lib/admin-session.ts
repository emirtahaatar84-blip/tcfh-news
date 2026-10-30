import { createHash, timingSafeEqual } from "crypto";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-constants";

/**
 * Deterministic session token derived from the admin credentials.
 * It is stored in an HttpOnly cookie after a successful Basic Auth challenge,
 * so that same-origin API calls made by the dashboard are authenticated too.
 */
export function getAdminSessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;

  const user = process.env.ADMIN_USER || "admin";

  return createHash("sha256")
    .update(`${user}:${password}:micro-news-admin`)
    .digest("hex");
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === name) {
      const rawValue = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }

  return null;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidAdminSession(request: Request): boolean {
  const expected = getAdminSessionToken();
  if (!expected) return false;

  const provided = readCookie(
    request.headers.get("cookie"),
    ADMIN_SESSION_COOKIE,
  );

  return provided !== null && safeCompare(provided, expected);
}
