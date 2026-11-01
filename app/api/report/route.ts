import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * FAZ 1.2 — Hata bildirimi.
 *
 * POST /api/report
 *   { newsId, reason, note? }
 *
 * KURALLAR:
 *   • IP başına saatte 5 istek.
 *   • IP DÜZ SAKLANMAZ — yalnızca tuzlu SHA-256 özeti (ipHash) yazılır.
 *   • Çerez YOK; kullanıcı kimliği YOK; oturum YOK.
 *
 * KVKK: ipHash geri döndürülemez ve 30 gün sonra temizlenir (cron).
 */

const REASONS = [
  "yanlis-bilgi",
  "eksik-bilgi",
  "kaynaksiz-iddia",
  "hakaret-ayrimcilik",
  "telif",
  "reklam-spam",
  "diger",
] as const;

type ReportReason = (typeof REASONS)[number];

const MAX_NOTE = 300;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 saat

/**
 * IP'yi geri döndürülemez biçimde karma. Tuz ortam değişkeninden gelir;
 * yoksa AUTH_SECRET'e düşer (ikisi de sunucuda kalır).
 */
function hashIp(ip: string): string {
  const salt = process.env.REPORT_HASH_SALT?.trim() || process.env.AUTH_SECRET || "micro-news";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Vekil (Cloudflare/Nginx) arkasında gerçek istemci IP'si. */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("cf-connecting-ip");
  if (forwarded) return forwarded.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return request.headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

export async function POST(request: NextRequest) {
  // ── Gövde ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const input = body as { newsId?: unknown; reason?: unknown; note?: unknown };

  const newsId = typeof input.newsId === "string" ? input.newsId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{5,60}$/.test(newsId)) {
    return NextResponse.json(
      { success: false, error: "INVALID_NEWS_ID" },
      { status: 400 },
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!(REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json(
      { success: false, error: "INVALID_REASON", allowed: REASONS },
      { status: 400 },
    );
  }

  const note =
    typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : null;

  // ── Haber gerçekten var mı ─────────────────────────────────────────────
  const news = await prisma.newsItem.findFirst({
    where: { id: newsId, removedAt: null },
    select: { id: true },
  });

  if (!news) {
    return NextResponse.json(
      { success: false, error: "NEWS_NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── Hız limiti (IP başına, saatlik) ────────────────────────────────────
  const ipHash = hashIp(clientIp(request));
  const since = new Date(Date.now() - RATE_WINDOW_MS);

  const recent = await prisma.newsReport.count({
    where: { ipHash, createdAt: { gte: since } },
  });

  if (recent >= RATE_LIMIT) {
    const oldest = await prisma.newsReport.findFirst({
      where: { ipHash, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const retryAfter = oldest
      ? Math.max(
          1,
          Math.ceil((oldest.createdAt.getTime() + RATE_WINDOW_MS - Date.now()) / 1000),
        )
      : 3600;

    return NextResponse.json(
      { success: false, error: "RATE_LIMITED", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // ── Kaydet ─────────────────────────────────────────────────────────────
  await prisma.newsReport.create({
    data: {
      newsId,
      reason: reason as ReportReason,
      note,
      ipHash,
    },
  });

  return NextResponse.json(
    { success: true, remaining: Math.max(0, RATE_LIMIT - recent - 1) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

/** Bildirim nedenlerini döndürür (istemci formu için, anahtar gerekmez). */
export async function GET() {
  return NextResponse.json(
    { reasons: REASONS },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
