import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import {
  adminPushSendSchema,
  normalizeCategories,
  sendToCategories,
  type PushPayload,
} from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/push/send — OWNER (isAdminAuthorized).
 * Gövde: { title, body, url?, categories? }
 * categories boş / ["all"] → tüm aboneler. Test/duyuru gönderimi için.
 * → 200 { sent, failed, removed }
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = adminPushSendSchema.safeParse(body);

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

  const categories = normalizeCategories(parsed.data.categories ?? []);

  const payload: PushPayload = {
    title: parsed.data.title,
    body: parsed.data.body,
    url: parsed.data.url?.trim() || "/tr",
    // Duyuru bildirimleri tek tag ile birleşir.
    tag: "duyuru",
  };

  try {
    const summary = await sendToCategories(categories, payload);

    return NextResponse.json(
      { ...summary, categories },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "SEND_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Bildirim gönderilemedi.",
      },
      { status: 400 },
    );
  }
}
