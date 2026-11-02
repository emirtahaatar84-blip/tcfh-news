import { describe, expect, it } from "vitest";
import {
  matchNiche,
  tierOf,
  weightOf,
  orderForNiche,
  TIER_WEIGHT,
  CATEGORY_TIER,
  NICHE_CATEGORY_ORDER,
  TRACKED_CLUBS,
  TRACKED_ENTITIES,
} from "@/lib/niche";
import { computeImportance } from "@/lib/importance";

/**
 * NİŞ testleri — site teknoloji/YZ odaklı.
 *
 * Kural: teknoloji ve yapay zekâ çekirdek; dünya gündemi ve takip edilen
 * kulüpler ilgi çekici; saf magazin spor ve dağınık gündem geri planda.
 */

const NOW = new Date("2026-11-02T15:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

describe("Niş — kategori katmanları", () => {
  it("teknoloji ve yapay zekâ çekirdek", () => {
    expect(tierOf("Teknoloji")).toBe("core");
    expect(tierOf("Yapay Zekâ")).toBe("core");
    expect(tierOf("Bilim")).toBe("core");
  });

  it("dünya gündemi, ekonomi ve siyaset ilgi çekici", () => {
    expect(tierOf("Dünya")).toBe("interest");
    expect(tierOf("Ekonomi")).toBe("interest");
    expect(tierOf("Siyaset")).toBe("interest");
  });

  it("spor geri planda", () => {
    expect(tierOf("Spor")).toBe("off");
    expect(weightOf("Spor")).toBeLessThan(weightOf("Teknoloji"));
  });

  it("çekirdek kategori en yüksek ağırlığa sahip", () => {
    expect(weightOf("Teknoloji")).toBe(TIER_WEIGHT.core);
    expect(weightOf("Dünya")).toBe(TIER_WEIGHT.interest);
    expect(TIER_WEIGHT.core).toBeGreaterThan(TIER_WEIGHT.interest);
    expect(TIER_WEIGHT.interest).toBeGreaterThan(TIER_WEIGHT.peripheral);
  });

  it("bilinmeyen kategori en düşük katmana düşer", () => {
    expect(tierOf("Bilinmeyen")).toBe("off");
  });
});

describe("Niş — takip edilen varlıklar", () => {
  it("teknoloji varlığı geçen haber çekirdek sayılır", () => {
    const match = matchNiche({
      title: "OpenAI yeni modelini duyurdu",
      category: "Teknoloji",
    });
    expect(match.isCore).toBe(true);
    expect(match.entity).toBe("openai");
  });

  it("başka kategoride olsa da varlık eşleşmesi çekirdeğe taşır", () => {
    const match = matchNiche({
      title: "Nvidia sponsorluk anlaşması imzaladı",
      category: "Spor",
    });
    expect(match.isCore).toBe(true);
    expect(match.entity).toBe("nvidia");
  });

  it("Türkçe karakterli varlıkları da yakalar", () => {
    const match = matchNiche({ title: "TÜBİTAK yeni program açtı", category: "Bilim" });
    expect(match.entity).not.toBeNull();
  });

  it("varlık listesi boş değil", () => {
    expect(TRACKED_ENTITIES.length).toBeGreaterThan(20);
  });
});

describe("Niş — spor kulüpleri", () => {
  it("takip edilen kulüp haberi ilgi çekiciye yükselir", () => {
    const match = matchNiche({
      title: "Fenerbahçe derbiyi kazandı",
      category: "Spor",
    });
    expect(match.tier).toBe("interest");
    expect(match.club).toBe("fenerbahçe");
  });

  it("yabancı kulüpler de takip ediliyor", () => {
    for (const club of ["Real Madrid", "Barcelona", "Liverpool"]) {
      const match = matchNiche({ title: `${club} transfer yaptı`, category: "Spor" });
      expect(match.tier).toBe("interest");
    }
  });

  it("kulüp geçmeyen spor haberi geri planda kalır", () => {
    const match = matchNiche({
      title: "Bölgesel amatör ligde hafta sonu sonuçları",
      category: "Spor",
    });
    expect(match.tier).toBe("off");
    expect(match.club).toBeNull();
  });

  it("kulüp listesi boş değil", () => {
    expect(TRACKED_CLUBS.length).toBeGreaterThan(10);
  });
});

describe("Niş — kategori sırası", () => {
  it("teknoloji ve yapay zekâ önce gelir", () => {
    const ordered = orderForNiche(["Spor", "Ekonomi", "Teknoloji", "Yapay Zekâ"]);
    expect(ordered[0]).toBe("Teknoloji");
    expect(ordered[1]).toBe("Yapay Zekâ");
    expect(ordered[ordered.length - 1]).toBe("Spor");
  });

  it("sıra listesi tüm kategorileri kapsar", () => {
    expect(NICHE_CATEGORY_ORDER).toHaveLength(11);
  });
});

describe("Niş — önem skoruna etkisi", () => {
  function base(overrides: Record<string, unknown> = {}) {
    return {
      title: "Test haberi",
      summary: "Kısa özet",
      category: "Gündem",
      sourcesCount: 2,
      verifiedSourceCount: 2,
      createdAt: hoursAgo(2),
      qualityScore: 7,
      factCheckStatus: null,
      now: NOW,
      ...overrides,
    };
  }

  it("teknoloji haberi gündem haberinden yüksek skor alır", () => {
    const tech = computeImportance(base({ title: "Yeni çip üretildi", category: "Teknoloji" }));
    const agenda = computeImportance(base({ title: "Bölgesel toplantı yapıldı", category: "Gündem" }));
    expect(tech.score).toBeGreaterThan(agenda.score);
  });

  it("takip edilen kulüp haberi sıradan spor haberinden yüksek", () => {
    const derby = computeImportance(base({ title: "Galatasaray derbiyi kazandı", category: "Spor" }));
    const amateur = computeImportance(base({ title: "Amatör lig sonuçları", category: "Spor" }));
    expect(derby.score).toBeGreaterThan(amateur.score);
  });

  it("skor sonucu niş bilgisini taşır", () => {
    const result = computeImportance(base({ title: "Nvidia çip tanıttı", category: "Teknoloji" }));
    expect(result.niche).toBeDefined();
    expect(result.niche.entity).toBe("nvidia");
    expect(result.niche.isCore).toBe(true);
  });

  it("dünya gündemi haberleri görünür kalır (çekirdekten düşük ama spor'dan yüksek)", () => {
    const world = computeImportance(base({ title: "ABD yaptırım açıkladı", category: "Dünya" }));
    const sport = computeImportance(base({ title: "Amatör lig", category: "Spor" }));
    expect(world.score).toBeGreaterThan(sport.score);
  });
});
