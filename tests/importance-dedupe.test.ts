import { describe, expect, it } from "vitest";
import {
  computeImportance,
  freshnessScore,
  rankByImportance,
  relevanceScore,
  verificationScore,
  IMPORTANCE_THRESHOLDS,
  CATEGORY_IMPORTANCE,
} from "@/lib/importance";
import { dedupeByTopic, similarity, topicTokens } from "@/lib/dedupe";

const NOW = new Date("2026-11-02T03:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

function base(overrides: Partial<Parameters<typeof computeImportance>[0]> = {}) {
  return {
    title: "Test haberi",
    summary: "Kısa özet",
    category: "Gündem",
    sourcesCount: 1,
    verifiedSourceCount: 1,
    createdAt: hoursAgo(2),
    qualityScore: null,
    factCheckStatus: null,
    now: NOW,
    ...overrides,
  };
}

describe("Önem skoru — doğrulama boyutu", () => {
  it("kaynak sayısı arttıkça puan artar", () => {
    expect(verificationScore(1)).toBeLessThan(verificationScore(2));
    expect(verificationScore(2)).toBeLessThan(verificationScore(3));
    expect(verificationScore(5)).toBe(1);
    expect(verificationScore(0)).toBe(0);
  });

  it("3 kaynaklı haber tek kaynaklıdan belirgin yüksek skor alır", () => {
    const single = computeImportance(base({ verifiedSourceCount: 1 }));
    const triple = computeImportance(base({ verifiedSourceCount: 3 }));
    expect(triple.score - single.score).toBeGreaterThan(20);
  });
});

describe("Önem skoru — tazelik", () => {
  it("6 saat içi tam puan", () => {
    expect(freshnessScore(hoursAgo(1), NOW)).toBe(1);
    expect(freshnessScore(hoursAgo(5), NOW)).toBe(1);
  });

  it("24 saat sonrası düşer", () => {
    expect(freshnessScore(hoursAgo(40), NOW)).toBeLessThan(0.5);
    expect(freshnessScore(hoursAgo(200), NOW)).toBeLessThan(0.2);
  });
});

describe("Önem skoru — Türkiye ilgisi", () => {
  it("Türkiye kurumları geçen haber yüksek ilgi alır", () => {
    expect(relevanceScore("Merkez Bankası faiz kararı", "")).toBeGreaterThan(0.5);
    // 2 sinyal (tbmm + meclis) → 0.8; 3+ sinyal tam puan.
    expect(relevanceScore("TBMM yeni kanun", "Meclis onayladı")).toBeGreaterThanOrEqual(0.8);
    expect(relevanceScore("TBMM kanun", "Meclis onayladı, bakanlık duyurdu")).toBe(1);
  });

  it("ilgisiz haber düşük ilgi alır", () => {
    expect(relevanceScore("Yeni kulaklık tanıtıldı", "Şirket duyurdu")).toBeLessThan(0.3);
  });
});

describe("Önem skoru — kategori ağırlığı", () => {
  it("sağlık ve gündem en yüksek, spor en düşük", () => {
    expect(CATEGORY_IMPORTANCE.Sağlık).toBeGreaterThan(CATEGORY_IMPORTANCE.Teknoloji);
    expect(CATEGORY_IMPORTANCE.Gündem).toBeGreaterThan(CATEGORY_IMPORTANCE.Spor);
  });

  it("aynı kaynak sayısında sağlık haberi spor haberinden yüksek", () => {
    const health = computeImportance(base({ category: "Sağlık", verifiedSourceCount: 2 }));
    const sport = computeImportance(base({ category: "Spor", verifiedSourceCount: 2 }));
    expect(health.score).toBeGreaterThan(sport.score);
  });
});

describe("Önem skoru — eşikler", () => {
  it("3 kaynaklı sağlık haberi 'öne çıkan' olur", () => {
    const result = computeImportance(
      base({
        title: "Sağlık Bakanlığı aşı programı başlattı",
        category: "Sağlık",
        verifiedSourceCount: 3,
        qualityScore: 8,
        factCheckStatus: "ok",
      }),
    );
    expect(result.isTopStory).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(IMPORTANCE_THRESHOLDS.topStory);
  });

  it("tek kaynaklı eski spor haberi düşük değerli", () => {
    const result = computeImportance(
      base({
        title: "Takım antrenman yaptı",
        category: "Spor",
        verifiedSourceCount: 1,
        createdAt: hoursAgo(60),
        qualityScore: 4,
      }),
    );
    expect(result.isTopStory).toBe(false);
    expect(result.score).toBeLessThan(IMPORTANCE_THRESHOLDS.topStory);
  });

  it("skor 0-100 aralığında kalır", () => {
    for (const v of [0, 1, 3, 10]) {
      const r = computeImportance(base({ verifiedSourceCount: v }));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("deterministiktir", () => {
    const a = computeImportance(base());
    const b = computeImportance(base());
    expect(a.score).toBe(b.score);
  });
});

describe("Sıralama", () => {
  it("yüksek skorlu haber öne çıkar", () => {
    const items = [
      base({ title: "Spor haberi", category: "Spor", verifiedSourceCount: 1, createdAt: hoursAgo(1) }),
      base({ title: "Sağlık haberi", category: "Sağlık", verifiedSourceCount: 3, createdAt: hoursAgo(5) }),
    ];
    const ranked = rankByImportance(items);
    expect(ranked[0].title).toBe("Sağlık haberi");
  });

  it("eşit skorda yeni haber önce gelir", () => {
    const items = [
      base({ title: "Eski", createdAt: hoursAgo(10) }),
      base({ title: "Yeni", createdAt: hoursAgo(1) }),
    ];
    const ranked = rankByImportance(items);
    expect(ranked[0].title).toBe("Yeni");
  });
});

describe("Tekrar bastırma", () => {
  const mk = (id: string, title: string, summary: string, h: number) => ({
    id,
    title,
    summary,
    createdAt: hoursAgo(h),
  });

  it("aynı konudan yalnızca birini bırakır", () => {
    const items = [
      mk("1", "Merkez Bankası politika faizini 250 baz puan indirdi", "Faiz kararı açıklandı", 2),
      mk("2", "Merkez Bankası faiz kararını duyurdu: 250 baz puan indirim", "Politika faizi düştü", 3),
    ];
    const { kept, suppressed } = dedupeByTopic(items);
    expect(kept).toHaveLength(1);
    expect(suppressed).toHaveLength(1);
  });

  it("farklı konuları bastırmaz", () => {
    const items = [
      mk("1", "Merkez Bankası faiz kararı", "İndirim yapıldı", 1),
      mk("2", "Fenerbahçe derbi hazırlığı", "Antrenman yapıldı", 1),
      mk("3", "İstanbul'da deprem", "AFAD açıklama yaptı", 1),
    ];
    const { kept } = dedupeByTopic(items);
    expect(kept).toHaveLength(3);
  });

  it("pencere dışındaki haberleri bastırmaz", () => {
    const items = [
      mk("1", "Merkez Bankası faiz kararı", "İndirim yapıldı", 1),
      mk("2", "Merkez Bankası faiz kararı", "İndirim yapıldı", 48),
    ];
    const { kept } = dedupeByTopic(items, { windowHours: 24 });
    expect(kept).toHaveLength(2);
  });

  it("en yüksek skorlu olanı tutar", () => {
    const items = [
      mk("1", "Merkez Bankası faiz kararı", "Kısa", 1),
      mk("2", "Merkez Bankası faiz kararı", "Uzun", 2),
    ];
    const { kept } = dedupeByTopic(items, { scoreOf: (item) => (item.id === "1" ? 10 : 90) });
    expect(kept[0].id).toBe("2");
  });

  it("gövdeleme benzerliği: aynı konu yüksek, farklı konu düşük", () => {
    const a = topicTokens("Merkez Bankası politika faizini 250 baz puan indirdi", "Faiz kararı");
    const b = topicTokens("Merkez Bankası faiz kararını duyurdu: 250 baz puan indirim", "Faizi düştü");
    const c = topicTokens("Fenerbahçe antrenman yaptı", "Hazırlık");

    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.55);
    expect(similarity(a, c)).toBeLessThan(0.2);
  });
});
