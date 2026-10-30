import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * E-mail + password registration — KAPALI.
 *
 * Sıfır veri politikası (KVKK): site bir şirket değildir, ziyaretçilerden
 * kişisel veri toplanmaz. Yeni hesap oluşturma kabul edilmez; giriş yalnızca
 * site sahibinin mevcut e-posta/şifre hesabıyla yapılır.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "SIGNUPS_CLOSED",
      message:
        "Yeni kayıtlar kabul edilmiyor. Site sıfır veri politikasıyla anonim olarak çalışır.",
    },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
