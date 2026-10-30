import { describe, expect, it } from "vitest";
import { nextOccurrence, nextRuns, quotaFor, currentRunKind } from "@/lib/hq/schedule";
import { PORTRAIT_RUN } from "@/lib/hq/config";

/**
 * Zamanlanmış çalıştırma testleri. Sunucu saat dilimi ne olursa olsun
 * hedef her zaman Europe/Istanbul'dur.
 */

const IST = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

describe("nextOccurrence", () => {
  it("08:00 TSİ'de sabah çalıştırması aynı gün 08:30'a kurulur", () => {
    // 27 Ekim 2026 05:00 UTC = 08:00 TSİ
    const next = nextOccurrence("08:30", "Europe/Istanbul", new Date("2026-10-27T05:00:00Z"));
    expect(IST(next.toISOString())).toBe("08:30");
    expect(next.toISOString()).toBe("2026-10-27T05:30:00.000Z");
  });

  it("08:31 TSİ'de sabah çalıştırması ertesi güne kayar", () => {
    const next = nextOccurrence("08:30", "Europe/Istanbul", new Date("2026-10-27T05:31:00Z"));
    expect(next.toISOString()).toBe("2026-10-28T05:30:00.000Z");
  });

  it("akşam çalıştırması 19:00 TSİ'ye kurulur (16:00 UTC)", () => {
    const next = nextOccurrence("19:00", "Europe/Istanbul", new Date("2026-10-27T09:00:00Z"));
    expect(next.toISOString()).toBe("2026-10-27T16:00:00.000Z");
    expect(IST(next.toISOString())).toBe("19:00");
  });

  it("yaz saati bitişinde (Kasım) yerel saat korunur", () => {
    // 2026-10-25 sonrası TSİ sabit +03; 2027 yazında da +03 (Türkiye kalıcı).
    const next = nextOccurrence("08:30", "Europe/Istanbul", new Date("2026-12-01T00:00:00Z"));
    expect(IST(next.toISOString())).toBe("08:30");
  });
});

describe("nextRuns", () => {
  it("üç çalıştırmayı kronolojik sıraya koyar", () => {
    const runs = nextRuns(new Date("2026-10-27T21:00:00Z"));
    expect(runs.map((run) => run.kind)).toEqual(["watchdog", "morning", "evening"]);
    for (let i = 1; i < runs.length; i += 1) {
      expect(runs[i].at.getTime()).toBeGreaterThan(runs[i - 1].at.getTime());
    }
  });
});

describe("quotaFor — telafi kuralı", () => {
  it("sabah 1 portre üretir", () => {
    expect(quotaFor("morning", true)).toBe(1);
    expect(quotaFor("morning", false)).toBe(1);
  });

  it("sabah başarılıysa akşam 1 üretir (gün toplamı 2)", () => {
    expect(quotaFor("evening", true)).toBe(1);
    expect(quotaFor("evening", true) + PORTRAIT_RUN.morningQuota).toBe(PORTRAIT_RUN.dailyFloor);
  });

  it("sabah başarısızsa akşam 2 üretir (gün toplamı 2)", () => {
    expect(quotaFor("evening", false)).toBe(2);
    expect(quotaFor("evening", false)).toBe(PORTRAIT_RUN.dailyFloor);
  });
});

describe("currentRunKind", () => {
  it("sabah penceresini doğru tanır", () => {
    expect(currentRunKind(new Date("2026-10-27T05:30:00Z"))).toBe("morning");
  });

  it("akşam penceresini doğru tanır", () => {
    expect(currentRunKind(new Date("2026-10-27T16:00:00Z"))).toBe("evening");
  });
});
