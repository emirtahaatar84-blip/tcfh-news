import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate, isTelegramEnabled } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * FAZ 4.2 — Telegram webhook.
 *
 * Telegram bu adrese güncellemeleri POST eder. Güvenlik: `secret_token`
 * doğrulanır (TELEGRAM_WEBHOOK_SECRET); yalnızca chat id işlenir.
 */
export async function POST(request: NextRequest) {
  if (!isTelegramEnabled()) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_DISABLED" }, { status: 503 });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expectedSecret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await handleTelegramUpdate(update as Parameters<typeof handleTelegramUpdate>[0]);
  } catch (error) {
    console.error("[telegram] webhook hatası:", (error as Error).message.slice(0, 200));
  }

  // Telegram 200 bekler; hata olsa da tekrar denemesin.
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ enabled: isTelegramEnabled() });
}
