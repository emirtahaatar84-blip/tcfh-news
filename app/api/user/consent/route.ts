import { NextResponse } from "next/server";
import { auth } from "@/lib/next-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function currentUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  return prisma.user.findUnique({ where: { email } });
}

export async function GET() {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  return NextResponse.json(
    { newsletterConsent: user.newsletterConsent },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await currentUser();

  if (!user) {
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

  const consent = (body as { newsletterConsent?: unknown })?.newsletterConsent;

  if (typeof consent !== "boolean") {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "newsletterConsent must be a boolean.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { newsletterConsent: consent },
  });

  return NextResponse.json({ newsletterConsent: updated.newsletterConsent });
}
