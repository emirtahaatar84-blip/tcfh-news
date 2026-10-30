import { NextRequest, NextResponse } from "next/server";
import {
  buildPortraitOrderBy,
  buildPortraitWhere,
  parsePortraitFilters,
} from "@/lib/portrait-query";
import { serializePortraitCard } from "@/lib/portrait-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

/** GET /api/portraits?category=&type=&range=&q=&sort=&page= */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const raw: Record<string, string | string[]> = {};
  for (const key of searchParams.keys()) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : (all[0] ?? "");
  }

  const filters = parsePortraitFilters(raw);

  const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limitValue = Number.parseInt(
    searchParams.get("limit") ?? String(DEFAULT_LIMIT),
    10,
  );

  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit =
    Number.isFinite(limitValue) && limitValue > 0
      ? Math.min(limitValue, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const where = buildPortraitWhere(filters);

  const rows = await prisma.portrait.findMany({
    where,
    orderBy: buildPortraitOrderBy(filters.sort),
    skip: (page - 1) * limit,
    take: limit + 1,
  });

  const total = await prisma.portrait.count({ where });
  const hasMore = rows.length > limit;

  return NextResponse.json(
    {
      items: rows.slice(0, limit).map(serializePortraitCard),
      total,
      page,
      hasMore,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
