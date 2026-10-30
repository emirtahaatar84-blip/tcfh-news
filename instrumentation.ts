/**
 * Next.js instrumentation hook — starts the internal schedulers when the
 * server boots (nodejs runtime only).
 *
 * 1. News synthesis fetch job:
 *    first run ~60s after boot (warmup), then every 10 minutes, so newly
 *    published stories appear in the feed quickly.
 *
 * 2. Hourly quality audit job (gemma-4-31b):
 *    first run ~5 minutes after boot, then every 60 minutes.
 *
 * 3. Auto radio bulletins ("Haber Radyosu"):
 *    hourly short bulletins every 60 minutes + detailed day-end digest
 *    at 23:35 Europe/Istanbul (20:35 UTC). Fully automatic (no owner
 *    review). Disable with ENABLE_RADIO_CRON=false.
 *
 * 4. Portrait pipeline (Ek Bölüm 9): every 6 hours, first run ~15 min after
 *    boot. Reads the external feed, scores stories, researches and publishes
 *    at most PORTRAIT_PER_DAY portraits. Disable with ENABLE_PORTRAIT_CRON=false.
 *
 * Disable all by setting ENABLE_INTERNAL_CRON=false in the environment.
 * External triggers are also available at /api/cron/process?key=… and
 * /api/cron/audit (owner protected) for aaPanel / Linux crontab setups.
 */

const FETCH_INTERVAL_MS = 10 * 60 * 1000;
const FETCH_WARMUP_DELAY_MS = 60 * 1000;
const AUDIT_INTERVAL_MS = 60 * 60 * 1000;
const AUDIT_WARMUP_DELAY_MS = 5 * 60 * 1000;
const RADIO_INTERVAL_MS = 60 * 60 * 1000;
const RADIO_WARMUP_DELAY_MS = 10 * 60 * 1000;
const RADIO_DAY_END_UTC_HOUR = 20; // 23:00 TSİ + 35 dk kayma
const RADIO_DAY_END_UTC_MINUTE = 35;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // ── SQLite: WAL + sağlık bekçisi ────────────────────────────────────────
  // WAL, okuyucu/yazıcı çakışmasını azaltır (tek dosya, yerel Docker
  // volume'u). Bekçi 3 ardışık hatada süreci sonlandırır; `restart:
  // unless-stopped` politikası konteyneri temiz bir kilit durumuyla açar.
  if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
    try {
      const { prisma } = await import("./lib/prisma");
      await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
      await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL");
      console.log("[instrumentation] SQLite journal_mode=WAL");
    } catch (error) {
      console.warn(
        "[instrumentation] SQLite WAL ayarlanamadı:",
        error instanceof Error ? error.message : error,
      );
    }

    let failures = 0;
    const watchdog = setInterval(async () => {
      try {
        const { prisma: client } = await import("./lib/prisma");
        await client.$queryRawUnsafe("SELECT 1");
        failures = 0;
      } catch (error) {
        failures += 1;
        console.error(
          `[watchdog] veritabanı kontrolü başarısız (${failures}/3):`,
          error instanceof Error ? error.message : error,
        );
        if (failures >= 3) {
          console.error(
            "[watchdog] veritabanı erişilemiyor; konteyner yeniden başlatılacak.",
          );
          process.exit(1);
        }
      }
    }, 120_000);
    watchdog.unref?.();
  }

  // ── Güvenlik: üretimde AUTH_SECRET zorunlu (açılışta zorla) ─────────────
  // Eksikse sunucu net hata ile düşer — sessizce güvensiz JWT imzasına
  // asla düşülmez. (docker-entrypoint migration'dan önce çalıştığı için
  // burada throw, konteyneri crash-loop'a sokar ve sorunu görünür kılar.)
  if (
    process.env.NODE_ENV === "production" &&
    !(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)
  ) {
    throw new Error(
      "AUTH_SECRET zorunludur. Üretim için güvenli bir değer ayarlayın: openssl rand -hex 32",
    );
  }

  if (process.env.ENABLE_INTERNAL_CRON === "false") return;

  const globalForCron = globalThis as unknown as {
    __newsCron?: boolean;
  };

  if (globalForCron.__newsCron) return;
  globalForCron.__newsCron = true;

  const { startFetchJob } = await import("./lib/processor");
  const { startAuditJob } = await import("./lib/auditor");
  const { runHourlyRadioTick, runDayEndDigestTick } = await import("./lib/podcast");

  const fetchTick = () => {
    try {
      const started = startFetchJob();
      console.log(
        started
          ? "[cron] news fetch started"
          : "[cron] news fetch skipped (already running)",
      );
    } catch (error) {
      console.error("[cron] news fetch failed:", error);
    }
  };

  const auditTick = () => {
    try {
      const started = startAuditJob();
      console.log(
        started
          ? "[cron] quality audit started"
          : "[cron] quality audit skipped (already running)",
      );
    } catch (error) {
      console.error("[cron] quality audit failed:", error);
    }
  };

  const fetchKickoff = setTimeout(() => {
    fetchTick();

    const interval = setInterval(fetchTick, FETCH_INTERVAL_MS);
    interval.unref?.();
  }, FETCH_WARMUP_DELAY_MS);

  fetchKickoff.unref();

  const auditKickoff = setTimeout(() => {
    auditTick();

    const interval = setInterval(auditTick, AUDIT_INTERVAL_MS);
    interval.unref?.();
  }, AUDIT_WARMUP_DELAY_MS);

  auditKickoff.unref();

  const nextFetch = new Date(Date.now() + FETCH_WARMUP_DELAY_MS);
  const nextAudit = new Date(Date.now() + AUDIT_WARMUP_DELAY_MS);

  let radioArmed = false;
  let nextDayEnd: Date | null = null;

  if (process.env.ENABLE_RADIO_CRON !== "false") {
    radioArmed = true;

    const radioTick = () => {
      try {
        void runHourlyRadioTick().then((started) => {
          if (started) console.log("[cron] hourly radio bulletin published");
        });
      } catch (error) {
        console.error("[cron] hourly radio failed:", error);
      }
    };

    const radioKickoff = setTimeout(() => {
      radioTick();
      const interval = setInterval(radioTick, RADIO_INTERVAL_MS);
      interval.unref?.();
    }, RADIO_WARMUP_DELAY_MS);
    radioKickoff.unref();

    // Gün sonu özeti: her gün 20:35 UTC'de (23:35 TSİ).
    const scheduleDayEnd = (): Date => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(RADIO_DAY_END_UTC_HOUR, RADIO_DAY_END_UTC_MINUTE, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }

      const delay = target.getTime() - now.getTime();
      const dayEndKickoff = setTimeout(() => {
        try {
          void runDayEndDigestTick().then((started) => {
            if (started) console.log("[cron] day-end digest published");
          });
        } catch (error) {
          console.error("[cron] day-end digest failed:", error);
        }
        // Sonraki gün — 24 saatlik döngü.
        const interval = setInterval(
          () => {
            try {
              void runDayEndDigestTick().then((started) => {
                if (started) console.log("[cron] day-end digest published");
              });
            } catch (error) {
              console.error("[cron] day-end digest failed:", error);
            }
          },
          24 * 60 * 60 * 1000,
        );
        interval.unref?.();
      }, delay);
      dayEndKickoff.unref();

      return target;
    };

    nextDayEnd = scheduleDayEnd();
  }

  // ── 4) Portre hattı — SABİT SAATLİ (08:30 / 19:00 / 00:15 Europe/Istanbul) ─
  let portraitArmed = false;
  const portraitPlan: string[] = [];

  if (process.env.ENABLE_PORTRAIT_CRON !== "false") {
    const { runPortraitPipeline } = await import("./lib/portrait-pipeline");
    const { nextOccurrence, currentRunKind, quotaFor } = await import("./lib/hq/schedule");
    const { SCHEDULE } = await import("./lib/hq/config");

    const startOfToday = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
      return new Date(start - 3 * 60 * 60 * 1000);
    };

    /** Sabah çalıştırması bugün en az 1 portre üretti mi? */
    const morningSucceeded = async () => {
      const { prisma: client } = await import("./lib/prisma");
      const start = startOfToday();
      const produced = await client.portrait.count({
        where: {
          OR: [
            { status: "published", publishedAt: { gte: start } },
            { status: "review", createdAt: { gte: start } },
          ],
        },
      });
      // Sabah penceresi 12:00'a kadar: bu saatten önce üretilmiş kayıtlar
      // sabah çalıştırmasına aittir.
      return produced > 0;
    };

    const portraitTick = async (kind: "morning" | "evening" | "watchdog") => {
      try {
        if (kind === "watchdog") {
          const { runHealthCheck } = await import("./lib/portrait-health");
          const report = await runHealthCheck();
          console.log(
            `[cron] portrait watchdog: son ${report.hoursSinceLastPortrait ?? "?"} saatte ` +
              `${report.publishedInWindow}/${report.minimum} yayın · ${report.deadSources.length} ölü kaynak · ` +
              `durum=${report.status} · ${report.note}`,
          );
          return;
        }

        const ok = kind === "morning" ? true : await morningSucceeded();
        const quota = quotaFor(kind, ok);

        const summary = await runPortraitPipeline({ trigger: kind, quota });
        console.log(
          `[cron] portrait ${kind} (kota ${quota}): ${summary.status} fetched=${summary.fetched} ` +
            `fresh=${summary.fresh} published=${summary.published} review=${summary.review} failed=${summary.failed}`,
        );
      } catch (error) {
        console.error(`[cron] portrait ${kind} failed:`, error);
      }
    };

    /** Verilen saatte çalışır, sonra ertesi gün aynı saatte yeniden kurar. */
    const armDaily = (kind: "morning" | "evening" | "watchdog") => {
      const hhmm = kind === "morning" ? SCHEDULE.morning : kind === "evening" ? SCHEDULE.evening : SCHEDULE.watchdog;
      const next = nextOccurrence(hhmm, SCHEDULE.timezone);
      portraitPlan.push(`${kind} ${hhmm} → ${next.toISOString()}`);

      const timer = setTimeout(() => {
        void portraitTick(kind).finally(() => armDaily(kind));
      }, Math.max(0, next.getTime() - Date.now()));
      timer.unref?.();
    };

    armDaily("morning");
    armDaily("evening");
    armDaily("watchdog");
    portraitArmed = true;
  }

  // ── 5) Haftalık atıf denetimi (pazartesi 03:00 TSİ) ──────────────────────
  if (process.env.ENABLE_CITATION_AUDIT !== "false") {
    const { runCitationAudit, purgeOldCitations } = await import("./lib/citation-audit");

    const weekly = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const day = ist.getUTCDay();
      let diff = (1 - day + 7) % 7; // pazartesi
      const target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + diff, 0, 0, 0);
      let at = new Date(target - 3 * 60 * 60 * 1000);
      if (at.getTime() <= now.getTime()) at = new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000);

      const timer = setTimeout(async () => {
        try {
          const [report, purged] = await Promise.all([runCitationAudit(), purgeOldCitations()]);
          console.log(
            `[cron] citation audit: örnek=${report.sampled} denetlenen=${report.judged} yanlış=%${report.wrongRate ?? "—"} ` +
              `eşik ${report.thresholdBefore}→${report.thresholdAfter} · temizlenen=${purged}`,
          );
        } catch (error) {
          console.error("[cron] citation audit failed:", error);
        }
        weekly();
      }, Math.max(0, at.getTime() - now.getTime()));
      timer.unref?.();
      return at;
    };

    console.log(`[instrumentation] citation audit armed (weekly, next ${weekly().toISOString()})`);
  }

  const nextRadio = new Date(Date.now() + RADIO_WARMUP_DELAY_MS);
  console.log(
    `[instrumentation] news fetch cron armed (every 10 min, first run at ${nextFetch.toISOString()}); ` +
      `quality audit cron armed (every 60 min, first run at ${nextAudit.toISOString()})`,
  );
  if (radioArmed) {
    console.log(
      `[instrumentation] radio cron armed (hourly bulletins every 60 min, first run at ${nextRadio.toISOString()}; ` +
        `day-end digest at ${nextDayEnd?.toISOString()})`,
    );
  }
  if (portraitArmed) {
    console.log(`[instrumentation] portrait cron armed — ${portraitPlan.join(" | ")}`);
  }
}
