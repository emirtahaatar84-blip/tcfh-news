import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public, best-effort view counter. Increments the stored viewCount for a
 * news item. Clients call this at most once per item per browser session.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "INVALID_JSON");
  }

  const id =
    typeof body === "object" && body !== null && "id" in body
      ? (body as { id?: unknown }).id
      : null;

  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return jsonError("A valid news id is required.", 400, "INVALID_ID");
  }

  try {
    const item = await prisma.newsItem.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    return NextResponse.json(
      { viewCount: item.viewCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    ) {
      return jsonError("News item not found.", 404, "NOT_FOUND");
    }

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "View could not be counted." },
      { status: 500 },
    );
  }
}
