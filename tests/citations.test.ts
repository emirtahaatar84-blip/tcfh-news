import { describe, expect, it } from "vitest";
import {
  annotateText,
  extractEntityMentions,
  normalizeCitationText,
  rankCitationCandidates,
  type IndexedTarget,
} from "@/lib/citations";
import { parseFeedPage, MAX_FEED_PAGE } from "@/lib/news-query";
import { MAX_DOM_CARDS, trimFeedWindow } from "@/lib/feed-window";
import type { CitationAnchor } from "@/lib/citation-types";

function target(patch: Partial<IndexedTarget> = {}): IndexedTarget {
  return {
    id: "news-1",
    kind: "haber",
    slug: "ornek-haber",
    title: "Merkez Bankası faiz kararını açıkladı",
    titleNorm: ` ${normalizeCitationText("Merkez Bankası faiz kararını açıkladı")} `,
    summary: "Merkez Bankası politika faizini sabit tuttu. Karar sonrası piyasa sakin.",
    category: "Ekonomi",
    topicType: "olay",
    publishedAt: new Date("2026-10-20T10:00:00Z"),
    updatedAt: new Date("2026-10-20T12:00:00Z"),
    sourceCount: 4,
    readingMinutes: 3,
    ...patch,
  };
}

describe("atıf — özel ad çıkarımı", () => {
  it("kişi ve kurum adlarını yakalar", () => {
    const mentions = extractEntityMentions(
      "Cumhurbaşkanı Erdoğan, Türkiye Cumhuriyeti heyetiyle görüştü.",
    );
    const texts = mentions.map((mention) => mention.text);

    expect(texts).toContain("Cumhurbaşkanı Erdoğan");
    expect(texts).toContain("Türkiye Cumhuriyeti");
    // İyelik eki eşleşmeyi bozmaz: "Apple’ın" → "apple".
    expect(extractEntityMentions("Apple’ın gözlüğü")[0]?.tokens).toEqual(["apple"]);
  });

  it("cümle başındaki sıradan kelimeleri atıf yapmaz", () => {
    const mentions = extractEntityMentions(
      "Bu karar, yeni bir dönemin başlangıcı oldu.",
    );
    expect(mentions.map((mention) => mention.text)).not.toContain("Bu");
  });

  it("en fazla 12 kelimelik ifade üretir", () => {
    const long =
      "Ali Veli Hasan Hüseyin Mehmet Ayşe Fatma Zeynep Ahmet Murat Can Deniz Ece Su";
    const mentions = extractEntityMentions(`${long} toplantıya katıldı.`);

    for (const mention of mentions) {
      expect(mention.text.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });
});

describe("atıf — hedef puanlama", () => {
  it("yalnızca daha önce yayımlanmış içerikleri hedef alır", () => {
    const mention = extractEntityMentions("Merkez Bankası kararı")[0];
    expect(mention).toBeDefined();

    const current = {
      id: "self",
      kind: "haber" as const,
      publishedAt: new Date("2026-10-21T10:00:00Z"),
    };

    const ranked = rankCitationCandidates(mention, [target()], current);
    expect(ranked).toHaveLength(1);

    const future = rankCitationCandidates(mention, [target()], {
      ...current,
      publishedAt: new Date("2026-10-19T10:00:00Z"),
    });
    expect(future).toHaveLength(0);
  });

  it("kendini hedef göstermez", () => {
    const mention = extractEntityMentions("Merkez Bankası kararı")[0];
    const ranked = rankCitationCandidates(mention, [target()], {
      id: "news-1",
      kind: "haber",
      publishedAt: new Date("2026-10-25T10:00:00Z"),
    });
    expect(ranked).toHaveLength(0);
  });
});

describe("atıf — metin işaretleme", () => {
  const anchor: CitationAnchor = {
    targetId: "news-1",
    phrase: "Merkez Bankası",
    href: "/tr/haber/ornek-haber",
    preview: {
      id: "news-1",
      slug: "ornek-haber",
      href: "/tr/haber/ornek-haber",
      kind: "haber",
      title: "Merkez Bankası faiz kararını açıkladı",
      firstSentence: "Merkez Bankası politika faizini sabit tuttu.",
      category: "Ekonomi",
      topicType: "olay",
      publishedAt: "2026-10-20T10:00:00.000Z",
      updatedAt: null,
      sourceCount: 4,
      readingTime: 3,
      listenTime: 2,
    },
  };

  it("ifadeyi böler ve hedefi bir kez işaretler", () => {
    const used = new Set<string>();
    const parts = annotateText(
      "Merkez Bankası kararını açıkladı. Merkez Bankası açıklama yaptı.",
      [anchor],
      used,
    );

    expect(parts.filter((part) => part.citation)).toHaveLength(1);
    expect(parts.map((part) => part.text).join("")).toContain("Merkez Bankası");
  });

  it("kullanılmış hedefi yeniden işaretlemez", () => {
    const used = new Set<string>(["news-1"]);
    const parts = annotateText("Merkez Bankası kararı", [anchor], used);
    expect(parts).toHaveLength(1);
    expect(parts[0].citation).toBeUndefined();
  });
});

describe("sonsuz akış — sayfa parametresi", () => {
  it("geçersiz değerleri 1 yapar, aşırıyı sınırlar", () => {
    expect(parseFeedPage(undefined)).toBe(1);
    expect(parseFeedPage("0")).toBe(1);
    expect(parseFeedPage("abc")).toBe(1);
    expect(parseFeedPage("3")).toBe(3);
    expect(parseFeedPage(["4"])).toBe(4);
    expect(parseFeedPage("999")).toBe(MAX_FEED_PAGE);
  });
});

describe("sonsuz akış — DOM penceresi (bellek)", () => {
  it("300 kartta yalnızca son 120 kartı tutar, sıra korunur", () => {
    const items = Array.from({ length: 300 }, (_, index) => index);
    const { items: windowed, removed } = trimFeedWindow(items);

    expect(removed).toBe(180);
    expect(windowed).toHaveLength(MAX_DOM_CARDS);
    expect(windowed[0]).toBe(180);
    expect(windowed[windowed.length - 1]).toBe(299);
  });

  it("sınırın altında hiçbir kartı çıkarmaz", () => {
    const items = Array.from({ length: 119 }, (_, index) => index);
    const { items: windowed, removed } = trimFeedWindow(items);
    expect(removed).toBe(0);
    expect(windowed).toHaveLength(119);
  });
});
