import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { restoreNewsItem } from "@/lib/auditor";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  newsItemId: z.string().regex(/^[a-zA-Z0-9]{5,40}$/, "Geçersiz haber kimliği."),
});

/**
 * POST /api/admin/moderation/restore (owner)
 * Gövde: { newsItemId } — yumuşak kaldırılmış haberi geri getirir
 * (removedAt/reason/removedBy temizlenir). 200: { success: true }.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Geçersiz JSON gövdesi.", 400, "INVALID_JSON");
  }

  const parsed = restoreSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "Gövde doğrulanamadı.",
      400,
      "INVALID_PAYLOAD",
    );
  }

  const restored = await restoreNewsItem(parsed.data.newsItemId);

  if (!restored) {
    return jsonError(
      "Haber bulunamadı veya zaten yayında.",
      404,
      "NOT_FOUND",
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
