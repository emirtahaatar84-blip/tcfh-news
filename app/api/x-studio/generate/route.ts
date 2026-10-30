import { NextRequest, NextResponse } from "next/server";
import {
  actorFromRequest,
  checkRateLimit,
  generateRequestSchema,
  isStudioAuthorized,
  startGenerateJob,
} from "@/lib/x-studio";

export const dynamic = "force-dynamic";

/**
 * POST /api/x-studio/generate
 * Gövde: { articleIds, styleSlug, tone, length, emojiLevel, withSource, withBadge }
 * Üretim KUYRUĞA atılır (senkron AI çağrısı yok) ve { jobId } döner.
 * İstemci GET /api/x-studio/generate/:jobId ile poll eder.
 *
 * Rate limit: kullanıcı başına dakikada 10 üretim.
 */
export async function POST(request: NextRequest) {
  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  if (!checkRateLimit(actorFromRequest(request))) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Dakikada en fazla 10 üretim yapabilirsiniz.",
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = generateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Gövde doğrulanamadı.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const jobId = startGenerateJob(parsed.data, actorFromRequest(request));

  return NextResponse.json(
    { jobId },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
