import { NextRequest, NextResponse } from "next/server";
import { getTimeline } from "@/lib/timeline";

export const dynamic = "force-dynamic";

/**
 * FAZ 3.1 — GET /api/timeline/:scope/:value
 *
 *   /api/timeline/tag/tcmb     → etiketin zaman çizelgesi
 *   /api/timeline/news/<id>    → bir olayın zaman çizelgesi
 *
 * Yanıt: { items[], digest, digestBuiltAt, total }
 * `digest` = "şu ana kadar ne oldu" (3-4 cümle, önbellekli).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scope: string; value: string }> },
) {
  const { scope: rawScope, value: rawValue } = await context.params;
  const value = decodeURIComponent(rawValue).trim();

  if (rawScope !== "tag" && rawScope !== "news") {
    return NextResponse.json(
      { error: "INVALID_SCOPE", allowed: ["tag", "news"] },
      { status: 400 },
    );
  }

  if (!/^[\p{L}\p{N}@_-]{2,60}$/u.test(value)) {
    return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
  }

  const limit = Math.min(100, Number(new URL(request.url).searchParams.get("limit") ?? "60") || 60);

  const result = await getTimeline(
    { kind: rawScope as "tag" | "news", value },
    limit,
  );

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
