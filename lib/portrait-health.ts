import { prisma } from "@/lib/prisma";
import { WATCHDOG } from "@/lib/hq/config";

/**
 * 00:15 günlük sağlık kontrolü.
 *
 * Üç soruyu yanıtlar ve tek satır rapor üretir:
 *   1. Dün en az 2 portre yayınlandı mı?
 *   2. Son 7 günün portre kaynaklarında ölü link var mı?
 *   3. Bir sonraki çalıştırma ne zaman?
 *
 * Hiçbir kullanıcı verisi işlemez (KVKK): yalnız içerik ve kaynak URL'leri.
 */

export type PortraitHealthReport = {
  checkedAt: string;
  windowFrom: string;
  publishedInWindow: number;
  minimum: number;
  passed: boolean;
  deadSources: { domain: string; url: string; status: string }[];
  lastPublishedAt: string | null;
  hoursSinceLastPortrait: number | null;
  nextRuns: string[];
  status: "ok" | "gecikme" | "kaynak_hatasi";
  note: string;
};

const PROBE_TIMEOUT_MS = 8_000;

async function probe(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });

    // 200 dışındaki her yanıt "ölü" sayılır (403/404/410/5xx).
    return response.ok ? null : `HTTP ${response.status}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    return message.includes("timeout") ? "zaman aşımı" : message.slice(0, 60);
  }
}

export async function runHealthCheck(): Promise<PortraitHealthReport> {
  const now = new Date();
  const windowFrom = new Date(now.getTime() - WATCHDOG.lookbackHours * 60 * 60 * 1000);

  const [publishedInWindow, last, recentSources] = await Promise.all([
    prisma.portrait.count({
      where: {
        status: "published",
        removedAt: null,
        publishedAt: { gte: windowFrom },
      },
    }),
    prisma.portrait.findFirst({
      where: { status: "published", removedAt: null },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true, title: true },
    }),
    prisma.portraitSource.findMany({
      where: {
        portrait: {
          status: "published",
          removedAt: null,
          publishedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
      select: { url: true, domain: true },
      take: 40,
    }),
  ]);

  // Aynı alan adından tek kez dene (azami 12 istek).
  const byDomain = new Map<string, string>();
  for (const source of recentSources) {
    if (!byDomain.has(source.domain)) byDomain.set(source.domain, source.url);
  }

  const probes = await Promise.all(
    [...byDomain.entries()].slice(0, 12).map(async ([domain, url]) => {
      const problem = await probe(url);
      return problem ? { domain, url, status: problem } : null;
    }),
  );

  const deadSources = probes.filter((item): item is NonNullable<typeof item> => item !== null);

  const hoursSinceLastPortrait = last?.publishedAt
    ? (now.getTime() - last.publishedAt.getTime()) / 3_600_000
    : null;

  const passed = publishedInWindow >= WATCHDOG.minPublishedPerDay;
  const sourceBroken = deadSources.length > WATCHDOG.maxDeadSources;

  const status: PortraitHealthReport["status"] = sourceBroken
    ? "kaynak_hatasi"
    : passed
      ? "ok"
      : "gecikme";

  const note = sourceBroken
    ? `${deadSources.length} ölü kaynak: ${deadSources.map((item) => item.domain).join(", ")}`
    : passed
      ? `Son ${WATCHDOG.lookbackHours} saatte ${publishedInWindow} portre yayınlandı.`
      : `Son ${WATCHDOG.lookbackHours} saatte ${publishedInWindow}/${WATCHDOG.minPublishedPerDay} portre — üretim durmuş.`;

  return {
    checkedAt: now.toISOString(),
    windowFrom: windowFrom.toISOString(),
    publishedInWindow,
    minimum: WATCHDOG.minPublishedPerDay,
    passed,
    deadSources,
    lastPublishedAt: last?.publishedAt?.toISOString() ?? null,
    hoursSinceLastPortrait: hoursSinceLastPortrait === null ? null : Number(hoursSinceLastPortrait.toFixed(1)),
    nextRuns: [],
    status,
    note,
  };
}
