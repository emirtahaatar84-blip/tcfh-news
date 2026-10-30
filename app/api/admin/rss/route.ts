import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { isCategory } from "@/lib/categories";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { serializeRssSource } from "@/lib/rss-source";
import { hostnameFromUrl, isValidHttpUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const sources = await prisma.rSSSource.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    sources: sources.map(serializeRssSource),
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const input = body as {
    name?: unknown;
    url?: unknown;
    category?: unknown;
  };

  if (typeof input.url !== "string") {
    return jsonError("An RSS URL is required.", 400, "INVALID_URL");
  }

  const url = input.url.trim();

  if (!isValidHttpUrl(url)) {
    return jsonError(
      "Enter a valid http(s) URL.",
      400,
      "INVALID_URL",
    );
  }

  // İŞ 3 — Kategori kullanıcıya SORULMAZ. Feed varsayılanı yalnızca
  // sınıflandırıcının 4. sinyali olarak saklanır; gönderilmezse "Gündem".
  const category =
    typeof input.category === "string" && isCategory(input.category)
      ? input.category
      : "Gündem";

  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 100)
      : hostnameFromUrl(url);

  try {
    const source = await prisma.rSSSource.create({
      data: { name, url, category },
    });

    return NextResponse.json(
      { source: serializeRssSource(source) },
      { status: 201 },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return jsonError(
        "This RSS URL is already added.",
        409,
        "DUPLICATE_SOURCE",
      );
    }

    throw error;
  }
}
