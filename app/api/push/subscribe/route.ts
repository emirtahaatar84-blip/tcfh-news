import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/next-auth";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  removeSubscription,
  saveSubscription,
} from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe — HERKESE AÇIK (cihaz bazlı; giriş şart değil).
 * Gövde: {
 *   subscription: { endpoint, keys: { p256dh, auth } },
 *   categories?: string[],   // lib/categories.ts değerleri + "all"
 *   locale?: "tr" | "en"
 * }
 * Aynı endpoint tekrar gelirse kategoriler güncellenir (upsert).
 * Oturum varsa abonelik userId ile bağlanır. → 201 { success, categories }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = pushSubscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Geçersiz istek gövdesi.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    // Oturum varsa aboneliği kullanıcıya bağla (yoksa cihaz bazlı kalır).
    const session = await auth();

    const result = await saveSubscription({
      endpoint: parsed.data.subscription.endpoint,
      p256dh: parsed.data.subscription.keys.p256dh,
      auth: parsed.data.subscription.keys.auth,
      categories: parsed.data.categories,
      locale: parsed.data.locale,
      userId: session?.user?.id ?? null,
    });

    return NextResponse.json(
      { success: true, categories: result.categories },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "SUBSCRIBE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Abonelik kaydedilemedi.",
      },
      { status: 400 },
    );
  }
}

/**
 * DELETE /api/push/subscribe — HERKESE AÇIK.
 * Gövde: { endpoint } → 200 { success: true }
 */
export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = pushUnsubscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Geçersiz istek gövdesi.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    await removeSubscription(parsed.data.endpoint);

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "UNSUBSCRIBE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Abonelik kaldırılamadı.",
      },
      { status: 400 },
    );
  }
}
