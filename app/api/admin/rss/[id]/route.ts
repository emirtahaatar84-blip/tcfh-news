import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { serializeRssSource } from "@/lib/rss-source";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return jsonError("Invalid source id.", 400, "INVALID_ID");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const isActive = (body as { isActive?: unknown })?.isActive;

  if (typeof isActive !== "boolean") {
    return jsonError(
      "isActive must be a boolean.",
      400,
      "INVALID_PAYLOAD",
    );
  }

  const existing = await prisma.rSSSource.findUnique({ where: { id } });
  if (!existing) {
    return jsonError("Source not found.", 404, "NOT_FOUND");
  }

  const source = await prisma.rSSSource.update({
    where: { id },
    data: { isActive },
  });

  return NextResponse.json({ source: serializeRssSource(source) });
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return jsonError("Invalid source id.", 400, "INVALID_ID");

  const existing = await prisma.rSSSource.findUnique({ where: { id } });
  if (!existing) {
    return jsonError("Source not found.", 404, "NOT_FOUND");
  }

  await prisma.rSSSource.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
