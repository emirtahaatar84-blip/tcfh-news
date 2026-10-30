import { NextRequest, NextResponse } from "next/server";
import {
  AiUnavailableError,
  answerWithContext,
  type AiMessage,
} from "@/lib/ai";
import { allowRequest } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_QUESTION = 500;
const MAX_MESSAGES = 8;
const NO_CONTENT = "Bu konuda sitemizde içerik yok.";

type IncomingMessage = { role?: unknown; content?: unknown };

function sanitizeMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is IncomingMessage => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const role =
        entry.role === "assistant"
          ? "assistant"
          : entry.role === "user"
            ? "user"
            : null;

      const content =
        typeof entry.content === "string"
          ? entry.content.trim().slice(0, MAX_QUESTION)
          : "";

      return role && content ? { role, content } : null;
    })
    .filter((entry): entry is AiMessage => entry !== null)
    .slice(-MAX_MESSAGES);
}

/** Sorgudan aranabilir anahtar kelimeler çıkarır (en fazla 4). */
function keywordsFrom(question: string): string[] {
  const stop = new Set([
    "ve","ile","bir","bu","şu","o","için","neden","nasıl","ne","mi","mı",
    "mu","mü","ama","çok","daha","en","son","haber","haberler","söyle",
    "anlat","nedir","var","yok","bugün","bugun","hakkında","hakkinda",
  ]);

  return [
    ...new Set(
      question
        .toLocaleLowerCase("tr")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 3 && !stop.has(word)),
    ),
  ].slice(0, 4);
}

/**
 * RAG sohbet: yalnızca sitede yayınlanmış haberlere dayanır.
 *
 * KVKK: sohbet geçmişi SUNUCUDA SAKLANMAZ. İstemciden gelen mesajlar
 * yalnızca bu istek süresince kullanılır, yanıtla birlikte atılır.
 * IP adresi okunmaz.
 */
export async function POST(request: NextRequest) {
  // Uç nokta bazlı, kişiselleştirilmemiş hız sınırı.
  if (!allowRequest("chat", 30)) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const body = payload as { messages?: unknown };
  const messages = sanitizeMessages(body.messages);
  const question = messages.filter((m) => m.role === "user").at(-1)?.content;

  if (!question) {
    return NextResponse.json({ error: "MISSING_QUESTION" }, { status: 400 });
  }

  const keywords = keywordsFrom(question);

  const rows =
    keywords.length > 0
      ? await prisma.newsItem.findMany({
          where: {
            removedAt: null,
            OR: keywords.flatMap((word) => [
              { title: { contains: word } },
              { summary: { contains: word } },
            ]),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 5,
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            createdAt: true,
          },
        })
      : [];

  if (rows.length === 0) {
    return NextResponse.json(
      { success: true, answer: NO_CONTENT, sources: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const answer = await answerWithContext({
      question,
      history: messages.slice(0, -1),
      context: rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
      })),
    });

    return NextResponse.json(
      {
        success: true,
        answer,
        sources: rows.map((row) => ({
          id: row.id,
          slug: row.slug ?? row.id,
          title: row.title,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { success: false, error: "AI_UNAVAILABLE" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Bu soruyu yanıtlayamadım. Lütfen daha sonra tekrar deneyin.",
      },
      { status: 502 },
    );
  }
}
