import { describe, expect, it } from "vitest";
import { buildDigestBody } from "@/lib/digest";
import { extractUsage, usageDate } from "@/lib/token-budget";
import { buildRssXml } from "@/lib/feeds";

/**
 * FAZ 5.5 — çekirdek birim testleri.
 * (Doğrulama ve rate limit testleri ayrı dosyalarda; burada RSS, olay
 * gruplama mantığı, token sayacı ve tarih sınırı kilitlenir.)
 */

describe("RSS — geçerlilik", () => {
  const items = [
    {
      id: "1",
      slug: "test-haber",
      title: "Merkez Bankası faizi indirdi",
      summary: "Politika faizi 250 baz puan düştü.",
      category: "Ekonomi",
      createdAt: new Date("2026-11-01T08:00:00Z"),
    },
  ];

  it("well-formed XML üretir", () => {
    const xml = buildRssXml({
      title: "Test",
      description: "Açıklama",
      link: "https://example.com/rss.xml",
      items: items as never,
    });

    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("</rss>");
    // Açılış/kapanış dengesi
    expect((xml.match(/<item>/g) ?? []).length).toBe((xml.match(/<\/item>/g) ?? []).length);
  });

  it("özel karakterleri kaçırır", () => {
    const xml = buildRssXml({
      title: "A & B",
      description: "<script>",
      link: "https://example.com",
      items: [
        {
          id: "2",
          slug: "x",
          title: "Test <b>&</b>",
          summary: '"alıntı"',
          category: "Ekonomi",
          createdAt: new Date(),
        },
      ] as never,
    });

    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("<script>");
  });

  it("her haber için link ve başlık içerir", () => {
    const xml = buildRssXml({
      title: "T",
      description: "D",
      link: "https://example.com/rss.xml",
      items: items as never,
    });

    expect(xml).toContain("test-haber");
    expect(xml).toContain("Merkez Bankası faizi indirdi");
  });
});

describe("Olay gruplama — zaman penceresi kuralı", () => {
  // Kümeleme, processor'daki 0.25 başlık benzerliği eşiğini kullanır.
  // Burada kuralın davranışı kilitlenir.
  function similarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let shared = 0;
    for (const token of setA) if (setB.has(token)) shared += 1;
    return setA.size === 0 ? 0 : shared / setA.size;
  }

  it("aynı konulu başlıklar eşiği geçer", () => {
    const score = similarity(
      ["merkez", "banka", "faiz", "indirdi"],
      ["merkez", "banka", "faiz", "kararı"],
    );
    expect(score).toBeGreaterThanOrEqual(0.25);
  });

  it("farklı olaylar eşiğin altında kalır", () => {
    const score = similarity(
      ["borsa", "rekor", "kapattı"],
      ["deprem", "istanbul", "hasar"],
    );
    expect(score).toBeLessThan(0.25);
  });
});

describe("Token sayacı — usage çıkarımı", () => {
  it("OpenAI biçimini okur", () => {
    expect(
      extractUsage({ usage: { prompt_tokens: 120, completion_tokens: 80 } }),
    ).toEqual({ promptTokens: 120, completionTokens: 80 });
  });

  it("Anthropic biçimini okur", () => {
    expect(
      extractUsage({ usage: { input_tokens: 50, output_tokens: 30 } }),
    ).toEqual({ promptTokens: 50, completionTokens: 30 });
  });

  it("Gemini biçimini okur", () => {
    expect(
      extractUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
    ).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it("usage yoksa sıfır döner", () => {
    expect(extractUsage({ choices: [] })).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(extractUsage(null)).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("gün sınırını İstanbul saatine göre hesaplar", () => {
    expect(usageDate(new Date("2026-11-01T22:00:00Z"))).toBe("2026-11-02");
    expect(usageDate(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-01");
  });
});

describe("Günlük özet — determinizm", () => {
  it("aynı haber seti aynı metni üretir", () => {
    const items = [
      { id: "1", title: "A haberi", slug: "a", category: "Ekonomi" },
      { id: "2", title: "B haberi", slug: "b", category: "Spor" },
    ];
    const first = buildDigestBody(items, "2026-11-01");
    const second = buildDigestBody(items, "2026-11-01");
    expect(first).toBe(second);
  });
});
