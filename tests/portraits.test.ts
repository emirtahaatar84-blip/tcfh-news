import { describe, expect, it } from "vitest";
import {
  SCORE_THRESHOLD,
  SCORE_WEIGHTS,
  isRecentlyCovered,
  scoreStories,
} from "@/lib/portrait-score";
import type { FeedStory } from "@/lib/kantan-feed";
import {
  findSpecialCategoryViolation,
  normalizeTimelineDate,
  runAutoChecks,
  slugify,
  type PortraitDraft,
} from "@/lib/portrait-generate";
import type { ResearchSource } from "@/lib/research";
import {
  hasPortraitFilters,
  parsePortraitFilters,
} from "@/lib/portrait-query";
import { parseFeedFilters } from "@/lib/news-query";

function story(overrides: Partial<FeedStory> = {}): FeedStory {
  return {
    key: "kantan.news:1",
    title: "SİPER Ürün-2 uçuş esnasında hedef değiştirerek tam isabet sağladı",
    url: "https://kantan.news/siper-urun-2",
    originalUrl: "https://www.aa.com.tr/tr/siper",
    publishedAt: new Date(),
    summary:
      "Savunma Sanayii Başkanı Haluk Görgün, SİPER Ürün-2 füzesinin test atışında hedef değiştirdiğini açıkladı.",
    category: "Savunma",
    tags: ["SİPER", "SSB", "savunma"],
    imageUrl: null,
    imageCredit: null,
    externalId: "1",
    ...overrides,
  };
}

function source(index: number): ResearchSource {
  return {
    name: `Kaynak ${index}`,
    title: `Haber başlığı ${index}`,
    url: `https://ornek${index}.com.tr/haber`,
    domain: `ornek${index}.com.tr`,
    publishedAt: new Date(),
    accessedAt: new Date(),
    kind: "news",
    text:
      "Haluk Görgün, SİPER Ürün-2 füzesinin test atışında hedef değiştirerek tam isabet sağladığını açıkladı. " +
      "Test, Savunma Sanayii Başkanlığı koordinasyonunda gerçekleştirildi ve sistemin menzili artırıldı.",
    isPrimary: index === 1,
  };
}

function draft(overrides: Partial<PortraitDraft> = {}): PortraitDraft {
  return {
    title: "SİPER Ürün-2: Hedef değiştiren füze",
    subtitle:
      "SİPER Ürün-2, test atışında uçuş sırasında hedef değiştirerek tam isabet sağladı.",
    subjectType: "kurum",
    subjectName: "Savunma Sanayii Başkanlığı",
    whyNow: [
      { text: "Test atışı başarıyla tamamlandı.", sourceIndex: 1 },
      { text: "Sistemin menzili artırıldı.", sourceIndex: 2 },
      { text: "Başkanlık koordinasyonunda yürütüldü.", sourceIndex: 3 },
    ],
    timeline: [
      { date: "2026-10-01", text: "İlk test duyuruldu.", sourceIndex: 1 },
      { date: "2026-10-10", text: "Hazırlık süreci başladı.", sourceIndex: 2 },
      { date: "2026-10-20", text: "Atış gerçekleşti.", sourceIndex: 1 },
      { date: "2026-10-24", text: "Sonuçlar açıklandı.", sourceIndex: 2 },
    ],
    keyFacts: [
      { text: "Füze uçuş sırasında hedef değiştirebiliyor.", sourceIndex: 1 },
      { text: "Test başarıyla tamamlandı.", sourceIndex: 1 },
      { text: "Menzil artırıldı.", sourceIndex: 2 },
      { text: "Başkanlık koordinasyonunda yürütüldü.", sourceIndex: 3 },
      { text: "Sistem yerli imkânlarla geliştirildi.", sourceIndex: 2 },
    ],
    quote: null,
    faqs: [
      { question: "Test ne zaman yapıldı?", answer: "Ekim 2026'da.", sourceIndex: 1 },
      { question: "Kim açıkladı?", answer: "Haluk Görgün.", sourceIndex: 1 },
      { question: "Ne değişti?", answer: "Menzil artırıldı.", sourceIndex: 2 },
    ],
    updateNote: null,
    conflictNote: null,
    ...overrides,
  };
}

describe("portrait scoring", () => {
  it("ağırlıklar toplamı 1 olmalı", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("Türkiye bağlantılı savunma haberi eşiği geçmeli", () => {
    const stories = [story(), story({ key: "kantan.news:2", title: "AMD yeni işlemci duyurdu", originalUrl: "https://www.tomshardware.com/x", category: "Donanım", summary: "AMD, yeni Ryzen işlemcisini tanıttı." })];
    const scores = scoreStories(stories);
    const target = scores.get("kantan.news:1");

    expect(target).toBeDefined();
    expect(target!.total).toBeGreaterThanOrEqual(SCORE_THRESHOLD);
    // Hikâye bir kişinin açıklaması üzerine kurulu → kişi portresi.
    expect(target!.subjectType).toBe("kisi");
    expect(target!.subjectName).toBe("Haluk Görgün");
    expect(target!.dimensions.publicInterest.weight).toBe(0.3);
  });

  it("yabancı ve ilgisiz haber eşiğin altında kalmalı", () => {
    const scores = scoreStories([
      story({
        key: "kantan.news:3",
        title: "New smartphone accessory launched by a small startup",
        originalUrl: "https://example.com/gadget",
        category: "Telefon",
        summary: "A small startup launched a phone case accessory.",
        tags: [],
      }),
    ]);

    expect(scores.get("kantan.news:3")!.total).toBeLessThan(SCORE_THRESHOLD);
  });

  it("aynı konu 7 gün içinde işlendiyse yakalar", () => {
    const result = isRecentlyCovered(
      { title: "SİPER Ürün-2 test atışı", subjectName: "Savunma Sanayii Başkanlığı", category: "Savunma" },
      [
        {
          title: "SİPER Ürün-2: Hedef değiştiren füze",
          subjectName: "Savunma Sanayii Başkanlığı",
          category: "Savunma",
        },
      ],
    );

    expect(result.covered).toBe(true);
  });
});

describe("portrait auto checks", () => {
  it("sağlıklı taslak tüm kontrolleri geçer", () => {
    const sources = [source(1), source(2), source(3)];
    const result = runAutoChecks({ draft: draft(), sources, domainCount: 3, model: "test" });

    expect(result.passed).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it("3 kaynaktan azı reddedilir", () => {
    const result = runAutoChecks({
      draft: draft(),
      sources: [source(1), source(2)],
      domainCount: 2,
      model: "test",
    });

    expect(result.passed).toBe(false);
    expect(result.notes.join(" ")).toMatch(/bağımsız kaynak/i);
  });

  it("geçersiz kaynak numarası yakalanır", () => {
    const result = runAutoChecks({
      draft: draft({
        keyFacts: [{ text: "Uydurma iddia", sourceIndex: 99 }],
      }),
      sources: [source(1), source(2), source(3)],
      domainCount: 3,
      model: "test",
    });

    expect(result.passed).toBe(false);
  });

  it("KVKK md. 6 kapsamındaki veri reddedilir", () => {
    const result = runAutoChecks({
      draft: draft({
        keyFacts: [
          { text: "Kişinin sağlık durumu kötüleşti.", sourceIndex: 1 },
          ...draft().keyFacts.slice(1),
        ],
      }),
      sources: [source(1), source(2), source(3)],
      domainCount: 3,
      model: "test",
    });

    expect(result.passed).toBe(false);
    expect(result.notes.join(" ")).toMatch(/KVKK md. 6/);
  });

  it("kaynakta birebir olmayan alıntı kaldırılır", () => {
    const result = runAutoChecks({
      draft: draft({
        quote: {
          text: "Bu cümle kaynaklarda hiç geçmiyor, tamamen uydurma bir alıntıdır.",
          speaker: "Bir yetkili",
          date: "2026-10-20",
          sourceIndex: 1,
        },
      }),
      sources: [source(1), source(2), source(3)],
      domainCount: 3,
      model: "test",
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/alıntı kutusu kaldırıldı/i);
  });
});

describe("portrait helpers", () => {
  it("Türkçe başlıktan okunabilir slug üretir", () => {
    expect(slugify("SİPER Ürün-2: Hedef Değiştiren Füze!")).toBe(
      "siper-urun-2-hedef-degistiren-fuze",
    );
  });

  it("Türkçe tarih ifadesini ISO'ya çevirir", () => {
    expect(normalizeTimelineDate("25 Ekim 2026")).toBe("2026-10-25");
    expect(normalizeTimelineDate("2026-10")).toBe("2026-10-01");
    expect(normalizeTimelineDate("2026")).toBe("2026-01-01");
    expect(normalizeTimelineDate("geçen hafta")).toBe("");
  });

  it("özel nitelikli veri kalıplarını yakalar", () => {
    expect(findSpecialCategoryViolation("Kişinin adli sicil kaydı var.")?.label).toBe(
      "adli sicil",
    );
    expect(findSpecialCategoryViolation("Füze testi başarılı oldu.")).toBeNull();
  });

  it("portre filtreleri URL'den ayrıştırılır", () => {
    const filters = parsePortraitFilters({
      q: "siper",
      category: "Gündem",
      type: "kurum",
      range: "week",
      sort: "views",
    });

    expect(filters).toEqual({
      query: "siper",
      category: "Gündem",
      type: "kurum",
      range: "week",
      sort: "views",
    });
    expect(hasPortraitFilters(filters)).toBe(true);
  });

  it("geçersiz filtre değerleri yok sayılır", () => {
    const filters = parsePortraitFilters({ category: "Uydurma", type: "x", range: "y" });

    expect(filters.category).toBeNull();
    expect(filters.type).toBeNull();
    expect(filters.range).toBe("all");
  });

  it("feed filtrelerinde il doğrulanır", () => {
    const filters = parseFeedFilters({ city: "İstanbul" });
    expect(filters.city).toBe("İstanbul");

    const invalid = parseFeedFilters({ city: "Atlantis" });
    expect(invalid.city).toBeNull();
  });
});
