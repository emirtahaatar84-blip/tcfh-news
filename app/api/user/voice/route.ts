import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/next-auth";
import { prisma } from "@/lib/prisma";
import { isVoiceKey } from "@/lib/voices";

export const dynamic = "force-dynamic";

/** Returns the signed-in user's preferred Sesli Özet voice persona. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { selectedVoice: true },
  });

  return NextResponse.json(
    { voice: user?.selectedVoice ?? "default" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Updates the preferred voice persona. */
export async function PUT(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const voice = (body as { voice?: unknown })?.voice;

  if (!isVoiceKey(voice)) {
    return NextResponse.json(
      {
        error: "INVALID_VOICE",
        message: "Unknown voice persona.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { selectedVoice: voice },
  });

  return NextResponse.json({ voice: updated.selectedVoice });
}
