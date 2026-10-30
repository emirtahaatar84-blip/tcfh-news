import { NextRequest, NextResponse } from "next/server";
import {
  buildNewsWhere,
  hasActiveFilters,
  parseFeedFilters,
} from "@/lib/news-query";
import { serializeNewsItem } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const raw: Record<string, string | string[]> = {};

  for (const key of searchParams.keys()) {
    raw[key] = searchParams.getAll(key).length > 1
      ? searchParams.getAll(key)
      : searchParams.get(key) ?? "";
  }

  const filters = parseFeedFilters(raw);

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

  const where = buildNewsWhere(filters);
  const sort = searchParams.get("sirala") === "okunan" ? "okunan" : "yeni";

  const [rows, total] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      orderBy:
        sort === "okunan"
          ? [{ viewCount: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit + 1,
    }),
    // İlk sayfada toplam sayı gösterilir (filtre çipleri + "N sonuç").
    page === 1 && hasActiveFilters(filters)
      ? prisma.newsItem.count({ where })
      : Promise.resolve(null),
  ]);

  const hasMore = rows.length > limit;

  return NextResponse.json(
    {
      items: rows.slice(0, limit).map(serializeNewsItem),
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      total,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
