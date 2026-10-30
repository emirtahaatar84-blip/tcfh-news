import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { getFetchJob, startFetchJob } from "@/lib/processor";

export const dynamic = "force-dynamic";

/**
 * Secure cron endpoint for automated hourly RSS fetching.
 *
 *   curl -s "http://localhost:3000/api/cron/fetch?key=YOUR_SECRET_KEY"
 *
 * Authorization (either works):
 *  - `?key=` query parameter matching the CRON_SECRET_KEY env variable
 *  - HTTP Basic Auth with the admin credentials
 *
 * The fetch itself runs in the background (202) so gateway timeouts
 * (e.g. Cloudflare 524) are never hit.
 */
async function isCronAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET_KEY?.trim();

  if (secret) {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const keyBuffer = Buffer.from(key, "utf8");
    const secretBuffer = Buffer.from(secret, "utf8");

    if (
      keyBuffer.length === secretBuffer.length &&
      timingSafeEqual(keyBuffer, secretBuffer)
    ) {
      return true;
    }
  }

  // Fall back to admin credentials (also keeps the endpoint usable when
  // CRON_SECRET_KEY is not configured).
  return await isAdminAuthorized(request);
}

async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) return unauthorized();

  const started = startFetchJob();
  const job = getFetchJob();

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
