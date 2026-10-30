import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { getFetchJob, startFetchJob } from "@/lib/processor";

export const dynamic = "force-dynamic";

/**
 * Starts the fetch job in the background and returns immediately (202).
 * This avoids gateway timeouts (e.g. Cloudflare 524) on long runs.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

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

/** Returns the current background job state for polling. */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  return NextResponse.json(getFetchJob(), {
    headers: { "Cache-Control": "no-store" },
  });
}
