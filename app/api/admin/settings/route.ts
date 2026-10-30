import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SETTINGS,
  getSettings,
  toSafeSettings,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const siteName = (body as { siteName?: unknown })?.siteName;

  if (typeof siteName !== "string") {
    return jsonError("siteName is required.", 400, "INVALID_SITE_NAME");
  }

  const trimmed = siteName.trim();

  if (trimmed.length < 1 || trimmed.length > 80) {
    return jsonError(
      "siteName must be between 1 and 80 characters.",
      400,
      "INVALID_SITE_NAME",
    );
  }

  await getSettings();

  const settings = await prisma.systemSettings.update({
    where: { id: 1 },
    data: { siteName: trimmed },
  });

  return NextResponse.json({
    settings: toSafeSettings(settings),
    defaults: { siteName: DEFAULT_SETTINGS.siteName },
  });
}
