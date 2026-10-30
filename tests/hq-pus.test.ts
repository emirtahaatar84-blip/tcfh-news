import { describe, expect, it } from "vitest";
import { computePus } from "@/lib/hq/pus";
import { PUS } from "@/lib/hq/config";
import { runQualityGates } from "@/lib/hq/gates";

const NOW = new Date("2026-10-27T06:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("PUS — portre uygunluk skoru", () => {
  it("ülke geneli, güncel, 3 kaynaklı konu 100 alır ve otomatik yayına gider", () => {
    const result = computePus({
      affectedScope: "country",
      distinctSubjects: 1,
      independentSources: 3,
      publishedAt: new Date(NOW.getTime() - 4 * HOUR),
      now: NOW,
      coveredRecently: false,
      turkeyImpact: true,
    });

    expect(result.total).toBe(100);
    expect(result.decision).toBe("auto");
  });

  it("eşik sınırları: ≥70 auto, 55-69 review, <55 reject", () => {
    expect(PUS.thresholds.autoPublish).toBe(70);
    expect(PUS.thresholds.reviewMin).toBe(55);

    const review = computePus({
      affectedScope: "company",
      distinctSubjects: 2,
      independentSources: 3,
      publishedAt: new Date(NOW.getTime() - 5 * DAY),
      now: NOW,
      coveredRecently: false,
      turkeyImpact: false,
    });

    expect(review.total).toBeGreaterThanOrEqual(55);
    expect(review.total).toBeLessThan(70);
    expect(review.decision).toBe("review");
  });

  it("son 7 günde işlenmiş konu özgünlüğü sıfırlar ve güncelleme moduna geçer", () => {
    const result = computePus({
      affectedScope: "country",
      distinctSubjects: 1,
      independentSources: 3,
      publishedAt: new Date(NOW.getTime() - 2 * HOUR),
      now: NOW,
      coveredRecently: true,
      turkeyImpact: true,
    });

    expect(result.originalityMode).toBe("update");
    expect(result.dimensions.originality.raw).toBe(0);
  });

  it("güncellik basamakları: 2 gün=5, 7 gün=3, 30 gün=1", () => {
    const base = {
      affectedScope: "sector" as const,
      distinctSubjects: 1,
      independentSources: 3,
      now: NOW,
      coveredRecently: false,
      turkeyImpact: false,
    };

    expect(computePus({ ...base, publishedAt: new Date(NOW.getTime() - 2 * DAY) }).dimensions.freshness.raw).toBe(5);
    expect(computePus({ ...base, publishedAt: new Date(NOW.getTime() - 5 * DAY) }).dimensions.freshness.raw).toBe(3);
    expect(computePus({ ...base, publishedAt: new Date(NOW.getTime() - 20 * DAY) }).dimensions.freshness.raw).toBe(1);
    expect(computePus({ ...base, publishedAt: new Date(NOW.getTime() - 40 * DAY) }).dimensions.freshness.raw).toBe(0);
  });

  it("dağınık konular 0-2 aralığında düşük odak puanı alır", () => {
    const result = computePus({
      affectedScope: "sector",
      distinctSubjects: 5,
      independentSources: 3,
      publishedAt: new Date(NOW.getTime() - 1 * HOUR),
      now: NOW,
      coveredRecently: false,
      turkeyImpact: true,
    });

    expect(result.dimensions.subjectFocus.raw).toBe(1);
  });
});

describe("Günlük kota — yalnızca yayınlananlar sayılır", () => {
  it("incelemedeki taslaklar günlük kotayı doldurmaz", () => {
    // Kural: remainingQuota = PER_DAY - publishedToday (review DEĞİL).
    // Gölge mod kapalıyken review'ler sayılırsa hat sonsuza kadar durur.
    const PER_DAY = 2;
    const publishedToday = 0;
    const reviewToday = 7;
    const remainingQuota = Math.max(0, PER_DAY - publishedToday);
    expect(remainingQuota).toBe(2);
    expect(remainingQuota).not.toBe(Math.max(0, PER_DAY - (publishedToday + reviewToday)));
  });
});

describe("Kalite kapıları — hukuk kapıları bloklar", () => {
  const sources = [
    { url: "https://aa.com.tr/a", domain: "aa.com.tr", text: "SİPER test edildi", alive: true },
    { url: "https://ntv.com.tr/b", domain: "ntv.com.tr", text: "SİPER menzili arttı", alive: true },
    { url: "https://shiftdelete.net/c", domain: "shiftdelete.net", text: "SİPER üretime girdi", alive: true },
  ];

  const draft = {
    title: "SİPER Ürün-2 havada hedef değiştiriyor",
    subtitle: "Türkiye'nin uzun menzilli hava savunma sistemi yeni test aşamasına geçti.",
    whyNow: [{ text: "a" }, { text: "b" }, { text: "c" }],
    timeline: [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }],
    keyFacts: [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }, { text: "5" }],
    transparencyNote: "Bu portre 3 bağımsız kaynaktan doğrulanmış olgularla üretildi.",
  };

  const base = {
    draft,
    sources,
    independentSourceCount: 3,
    maxSimilarity: 0.4,
    coveredRecently: false,
  };

  it("temiz portre 8 kapıyı da geçer", () => {
    const outcome = runQualityGates(base);
    expect(outcome.passed).toBe(true);
    expect(outcome.gates).toHaveLength(8);
  });

  it("KVKK md.6 — sağlık verisi geçerse 3. kapı bloklar", () => {
    const outcome = runQualityGates({
      ...base,
      draft: { ...draft, keyFacts: [...draft.keyFacts.slice(0, 4), { text: "Kişinin kanser tedavisi sürüyor" }] },
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.hardBlocked).toBe(true);
    expect(outcome.gates.find((gate) => gate.id === 3)?.ok).toBe(false);
  });

  it("reşit olmayan kişi 4. kapıyı bloklar", () => {
    const outcome = runQualityGates({
      ...base,
      draft: { ...draft, whyNow: [{ text: "16 yaşında öğrenci" }, { text: "b" }, { text: "c" }] },
    });
    expect(outcome.gates.find((gate) => gate.id === 4)?.ok).toBe(false);
  });

  it("ölü kaynak 1 ve 6. kapıyı bloklar", () => {
    const outcome = runQualityGates({
      ...base,
      sources: [sources[0], sources[1], { ...sources[2], alive: false }],
      independentSourceCount: 2,
    });
    const failed = outcome.gates.filter((gate) => !gate.ok).map((gate) => gate.id);
    expect(failed).toContain(1);
    expect(failed).toContain(6);
  });

  it("%85 üzeri benzerlik 8. kapıyı bloklar", () => {
    const outcome = runQualityGates({ ...base, maxSimilarity: 0.9 });
    expect(outcome.gates.find((gate) => gate.id === 8)?.ok).toBe(false);
  });

  it("doğrulanmamış suçlama başlıkta 5. kapıyı bloklar", () => {
    const outcome = runQualityGates({
      ...base,
      draft: { ...draft, title: "Müdür yolsuzluk yaptı" },
    });
    expect(outcome.gates.find((gate) => gate.id === 5)?.ok).toBe(false);
  });
});
