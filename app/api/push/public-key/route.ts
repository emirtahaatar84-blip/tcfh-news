import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/public-key — HERKESE AÇIK.
 * VAPID genel anahtarını döner. Anahtar yapılandırılmamışsa
 * { publicKey: null, enabled: false } — frontend bu durumda abonelik
 * düğmesini gizler.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return NextResponse.json(
      { publicKey: null, enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { publicKey, enabled: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
