import { NextResponse } from "next/server";
import { incrementDebateView } from "@/lib/debate/query";

export const dynamic = "force-dynamic";

/**
 * Toplu (anonim) okunma sayacı. Kullanıcı kimliği, oturum veya IP
 * gönderilmez/saklanmaz; yalnızca sayı artırılır.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await incrementDebateView(id);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
