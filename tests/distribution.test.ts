import { describe, expect, it } from "vitest";
import {
  buildSocialText,
  distributionKey,
  planChannels,
  retryDelayMs,
  MAX_ATTEMPTS,
  type DistributableStory,
} from "@/lib/distribution/engine";

/**
 * YAYILMA MOTORU — planlama testleri.
 *
 * Kural: her haber her kanala gitmez. Doğrulanmış ve taze haberler
 * bildirim/paylaşım alır; tek kaynaklı ve eski haberler yalnızca
 * arama motoru ve akış kanallarına gider.
 */

const NOW = Date.now();
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000);

function story(overrides: Partial<DistributableStory> = {}): DistributableStory {
  return {
    id: "news1",
    slug: "test-haber",
    title: "Test haberi başlığı",
    summary: "Kısa özet",
    category: "Teknoloji",
    sourcesCount: 3,
    verifiedSourceCount: 3,
    createdAt: hoursAgo(1),
    ...overrides,
  };
}

function plan(storyInput: DistributableStory, channel: string) {
  return planChannels(storyInput).find((item) => item.channel === channel);
}

describe("Yayılma planı — push", () => {
  it("doğrulanmış taze haber bildirim alır", () => {
    expect(plan(story({ verifiedSourceCount: 3 }), "push")?.shouldSend).toBe(true);
  });

  it("tek kaynaklı teknoloji haberi bildirim ALMAZ", () => {
    const result = plan(story({ verifiedSourceCount: 1, category: "Teknoloji" }), "push");
    expect(result?.shouldSend).toBe(false);
    expect(result?.reason).toContain("düşük öncelik");
  });

  it("tek kaynaklı ama öncelikli kategori (Sağlık) bildirim alır", () => {
    expect(plan(story({ verifiedSourceCount: 1, category: "Sağlık" }), "push")?.shouldSend).toBe(true);
  });

  it("eski haber (6 saat+) bildirim almaz", () => {
    const result = plan(story({ createdAt: hoursAgo(12) }), "push");
    expect(result?.shouldSend).toBe(false);
    expect(result?.reason).toContain("taze değil");
  });
});

describe("Yayılma planı — sosyal", () => {
  it("doğrulanmış haber paylaşıma uygun", () => {
    expect(plan(story({ verifiedSourceCount: 2 }), "social")?.shouldSend).toBe(true);
  });

  it("tek kaynaklı haber paylaşılmaz", () => {
    const result = plan(story({ verifiedSourceCount: 1 }), "social");
    expect(result?.shouldSend).toBe(false);
    expect(result?.reason).toContain("doğrulama beklenir");
  });
});

describe("Yayılma planı — her zaman giden kanallar", () => {
  it("indexnow, rss ve sitemap her habere gider", () => {
    for (const channel of ["indexnow", "rss", "sitemap"]) {
      expect(plan(story({ verifiedSourceCount: 1, createdAt: hoursAgo(100) }), channel)?.shouldSend).toBe(true);
    }
  });

  it("plan her zaman 5 kanal içerir", () => {
    expect(planChannels(story())).toHaveLength(5);
  });
});

describe("Idempotency ve geri çekilme", () => {
  it("aynı haber+kanal aynı anahtarı üretir", () => {
    expect(distributionKey("news1", "push")).toBe(distributionKey("news1", "push"));
  });

  it("farklı kanal farklı anahtar üretir", () => {
    expect(distributionKey("news1", "push")).not.toBe(distributionKey("news1", "indexnow"));
  });

  it("farklı haber farklı anahtar üretir", () => {
    expect(distributionKey("news1", "push")).not.toBe(distributionKey("news2", "push"));
  });

  it("geri çekilme süresi artar", () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBeGreaterThan(0);
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
    expect(retryDelayMs(3)).toBeGreaterThan(retryDelayMs(2));
  });

  it("deneme sınırı tanımlı", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
});

describe("Sosyal metin", () => {
  it("başlık, etiket ve link içerir", () => {
    const text = buildSocialText({
      title: "Merkez Bankası faizi indirdi",
      category: "Ekonomi",
      verifiedSourceCount: 3,
      slug: "merkez-bankasi-faiz",
      id: "abc",
    });

    expect(text).toContain("Merkez Bankası faizi indirdi");
    expect(text).toContain("#ekonomi");
    expect(text).toContain("/haber/merkez-bankasi-faiz");
    expect(text).toContain("3 kaynakla doğrulandı");
  });

  it("270 karakteri aşmaz", () => {
    const text = buildSocialText({
      title: "Çok uzun bir başlık ".repeat(20),
      category: "Teknoloji",
      verifiedSourceCount: 1,
      slug: "uzun",
      id: "abc",
    });
    expect(text.length).toBeLessThanOrEqual(270);
  });

  it("tek kaynakta doğrulama ibaresi eklemez", () => {
    const text = buildSocialText({
      title: "Test",
      category: "Spor",
      verifiedSourceCount: 1,
      slug: "t",
      id: "a",
    });
    expect(text).not.toContain("doğrulandı");
  });
});
