import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeMus,
  checkDebateGates,
  selectDailyBatch,
  sortDebatesForFeed,
  type DailyCandidate,
  type MusResult,
} from "@/lib/debate/score";
import {
  MUS_DAILY_LIMIT,
  MUS_THRESHOLDS,
  weightsForLevelFilter,
} from "@/lib/debate/config";
import { formatTotalMinutes, stagesForLevel } from "@/lib/debate/format";
import { parseDebateFilters, debateFiltersToQuery } from "@/lib/debate/query";

type SeedDebate = {
  slug: string;
  level: "lise" | "universite" | "karma";
  category: string;
  controversy: number;
  infoNeed: number;
  recencyDays: number;
  motionText: string;
  musScore: number;
  musBreakdown: { levelFilterScore: number };
  governmentThesis: unknown[];
  oppositionThesis: unknown[];
  keyClash: unknown[];
  sources: unknown[];
};

const seeds: SeedDebate[] = JSON.parse(
  readFileSync("prisma/seed/debates.json", "utf8"),
);

function seedMus(seed: SeedDebate, levelFilter: boolean): MusResult {
  return computeMus({
    controversy: seed.controversy,
    infoNeed: seed.infoNeed,
    recencyDays: seed.recencyDays,
    scope: "tr",
    levelFit: seed.level === "universite" ? 5 : 4,
    originality: "none",
    levelFilter,
  });
}

describe("MUS — örnek 3 konu", () => {
  it("lise örneği 88 (seviye filtresinde 87)", () => {
    const seed = seeds[0];
    expect(seedMus(seed, false).score).toBe(seed.musScore);
    expect(seedMus(seed, true).score).toBe(seed.musBreakdown.levelFilterScore);
    expect(seedMus(seed, false).decision).toBe("auto");
  });

  it("üniversite örneği 86 (seviye filtresinde 88)", () => {
    const seed = seeds[1];
    expect(seedMus(seed, false).score).toBe(seed.musScore);
    expect(seedMus(seed, true).score).toBe(seed.musBreakdown.levelFilterScore);
    expect(seedMus(seed, false).decision).toBe("auto");
  });

  it("tek taraflı konu elenir (tartışılabilirlik < 2)", () => {
    const result = computeMus({
      controversy: 1,
      infoNeed: 5,
      recencyDays: 4,
      scope: "global",
      levelFit: 3,
      originality: "none",
    });

    expect(result.eliminated).toBe(true);
    expect(result.decision).toBe("reject");
    expect(result.score).toBe(63);
  });

  it("seviye filtresinde levelFit ağırlığı 0.20 ve toplam 1.00", () => {
    const weights = weightsForLevelFilter(true);
    const sum = Object.values(weights).reduce((total, value) => total + value, 0);

    expect(weights.levelFit).toBeCloseTo(0.2, 5);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("MUS — eşikler ve kalite kapıları", () => {
  it("65 ve üzeri otomatik, 50-64 inceleme", () => {
    expect(MUS_THRESHOLDS.autoDraft).toBe(65);

    const review = computeMus({
      controversy: 4,
      infoNeed: 3,
      recencyDays: 45,
      scope: "global",
      hasTurkeyLink: true,
      levelFit: 3,
      originality: "similar",
    });

    expect(review.score).toBeGreaterThanOrEqual(50);
    expect(review.score).toBeLessThan(65);
    expect(review.decision).toBe("review");
  });

  it("kalite kapıları eksik kaynak/argümanı reddeder", () => {
    const failed = checkDebateGates({
      motionText: "Bu meclis, konuyu desteklemesi gerektiğine inanır.",
      independentSourceCount: 2,
      governmentArguments: 2,
      oppositionArguments: 3,
      keyClashCount: 3,
    });

    expect(failed.passed).toBe(false);
    expect(failed.failures.length).toBeGreaterThanOrEqual(2);

    const passed = checkDebateGates({
      motionText: "Bu meclis, konuyu desteklemesi gerektiğine inanır.",
      independentSourceCount: 3,
      governmentArguments: 3,
      oppositionArguments: 3,
      keyClashCount: 3,
    });

    expect(passed.passed).toBe(true);
  });

  it("özel nitelikli veri / reşit olmayan / suçlama başlığı reddedilir", () => {
    const result = checkDebateGates({
      motionText: "Bu meclis, konuyu desteklemesi gerektiğine inanır.",
      independentSourceCount: 3,
      governmentArguments: 3,
      oppositionArguments: 3,
      keyClashCount: 3,
      hasSpecialCategoryData: true,
      hasMinorName: true,
      hasUnverifiedAccusationInTitle: true,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(3);
  });
});

describe("MUS — akış sıralaması ve günlük kota", () => {
  const make = (
    patch: Partial<DailyCandidate> & { id: string },
  ): DailyCandidate => {
    const { id, ...rest } = patch;
    return {
      id,
      musScore: 80,
      recencyDays: 3,
      editorPin: 0,
      publishedAt: new Date("2026-10-20T09:00:00Z"),
      level: "lise",
      category: "Teknoloji",
      decision: "auto",
      ...rest,
    };
  };

  it("MUS %60 + güncellik %30 + sabitleme %10 sırası", () => {
    const old = make({ id: "old", musScore: 90, recencyDays: 60 });
    const fresh = make({ id: "fresh", musScore: 80, recencyDays: 1 });

    const sorted = sortDebatesForFeed([old, fresh]);
    expect(sorted[0].id).toBe("fresh");
  });

  it("günlük kota: toplam 3, lise 2 + üniversite 1, kategori çeşitliliği", () => {
    const candidates = [
      make({ id: "l1", category: "Teknoloji" }),
      make({ id: "l2", category: "Teknoloji" }),
      make({ id: "l3", category: "Teknoloji" }),
      make({ id: "l4", category: "Ekonomi" }),
      make({ id: "u1", level: "universite", category: "Siyaset" }),
      make({ id: "u2", level: "universite", category: "Kültür" }),
    ];

    const selected = selectDailyBatch(candidates);

    expect(selected).toHaveLength(MUS_DAILY_LIMIT.total);
    expect(selected.filter((item) => item.level === "lise")).toHaveLength(2);
    expect(selected.filter((item) => item.level === "universite")).toHaveLength(1);
    expect(
      selected.filter((item) => item.category === "Teknoloji").length,
    ).toBeLessThanOrEqual(MUS_DAILY_LIMIT.maxPerCategory);
  });
});

describe("Münazara formatları", () => {
  it("lise 24 dk / 6 aşama, üniversite 32 dk / 7 aşama", () => {
    expect(formatTotalMinutes("lise")).toBe(24);
    expect(stagesForLevel("lise")).toHaveLength(6);
    expect(formatTotalMinutes("universite")).toBe(32);
    expect(stagesForLevel("universite")).toHaveLength(7);
  });

  it("her aşamada 4 zorunlu alan var", () => {
    for (const stage of stagesForLevel("universite")) {
      expect(stage.required).toEqual([
        "claim",
        "warrant",
        "evidence",
        "impact",
      ]);
    }
  });
});

describe("Münazara URL filtreleri", () => {
  it("seviye/kategori/sıralama çözümlenir, geçersizler yok sayılır", () => {
    const filters = parseDebateFilters({
      seviye: "lise",
      kategori: "yapayzeka",
      sirala: "okunan",
    });

    expect(filters.level).toBe("lise");
    expect(filters.category).toBe("Yapay Zekâ");
    expect(filters.sort).toBe("okunan");

    const invalid = parseDebateFilters({
      seviye: "karma",
      kategori: "yok",
      sirala: "abc",
    });

    expect(invalid.level).toBe("tumu");
    expect(invalid.category).toBe("");
    expect(invalid.sort).toBe("mus");
  });

  it("sorgu dizesi yalnızca varsayılan olmayanları yazar", () => {
    expect(
      debateFiltersToQuery({ level: "tumu", category: "", sort: "mus" }),
    ).toBe("");
    expect(
      debateFiltersToQuery({
        level: "universite",
        category: "spor",
        sort: "yeni",
      }),
    ).toBe("?seviye=universite&kategori=spor&sirala=yeni");
  });
});
