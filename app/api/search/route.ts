import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LIMIT = 8;
const MAX_QUERY_LENGTH = 60;

/**
 * Komut paleti araması: başlık + spot + kaynak/etiket içinde hızlı arama.
 *
 * KVKK: sorgu metni SUNUCUDA SAKLANMAZ; yalnızca istek süresince
 * değerlendirilir ve yanıt `no-store` ile döner. Son aramalar yalnızca
 * cihazda (localStorage) tutulur.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  if (query.length < 2) {
    return NextResponse.json(
      { items: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await prisma.newsItem.findMany({
    where: {
      removedAt: null,
      OR: [
        { title: { contains: query } },
        { summary: { contains: query } },
        { sourcesList: { contains: query } },
        // FAZ 2.4 — etiketlerde de ara: "@nvidia" veya "nvidia" ile eşleşir.
        { tags: { contains: query } },
        { tags: { contains: query.replace(/^@/, "") } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      sourcesList: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug ?? row.id,
        title: row.title,
        summary: row.summary,
        category: row.category,
        sources: parseJsonArray(row.sourcesList).slice(0, 3),
        createdAt: row.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
