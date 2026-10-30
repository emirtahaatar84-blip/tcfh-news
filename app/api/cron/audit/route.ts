import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { getAuditJob, startAuditJob } from "@/lib/auditor";

export const dynamic = "force-dynamic";

/**
 * Saatlik kalite denetimi için manuel tetikleme ucu (owner korumalı):
 *
 *   curl -s -X POST "http://localhost:3000/api/cron/audit" \
 *        -u "$ADMIN_USER:$ADMIN_PASSWORD"
 *
 * Denetim (gemma-4-31b) arka planda çalışır; uç 202 ile iş durumunu döner.
 * Zamanlanmış tetikleme instrumentation.ts'teki 60 dakikalık cron'dadır.
 */
async function handle(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const started = startAuditJob();
  const job = getAuditJob();

  return NextResponse.json(
    { ...job, started },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
