import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { usageReport } from "@/lib/token-budget";

export const dynamic = "force-dynamic";

/**
 * FAZ 5.4 — GET /api/admin/usage
 *
 * Bugünkü token kullanımı: model bazında giriş/çıkış, bütçe durumu.
 * Yalnızca sahip (owner) erişebilir.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const report = await usageReport();

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
