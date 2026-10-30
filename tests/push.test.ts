import { describe, expect, it } from "vitest";
import {
  buildPushPayload,
  normalizeCategories,
  shouldAutoPush,
} from "@/lib/push";

// ─── normalizeCategories ─────────────────────────────────────────────────────

describe("normalizeCategories", () => {
  it("geçersiz değerleri atar, geçerli kategorileri tutar", () => {
    expect(
      normalizeCategories(["Teknoloji", "bogus", "Spor", 42, null]),
    ).toEqual(["Teknoloji", "Spor"]);
  });

  it("boş girdi → ['all']", () => {
    expect(normalizeCategories([])).toEqual(["all"]);
    expect(normalizeCategories(undefined)).toEqual(["all"]);
    expect(normalizeCategories(["geçersiz", ""])).toEqual(["all"]);
    expect(normalizeCategories("Teknoloji")).toEqual(["all"]);
  });

  it("tekrarları temizler", () => {
    expect(
      normalizeCategories(["Teknoloji", "Teknoloji", "all", "all"]),
    ).toEqual(["Teknoloji", "all"]);
  });

  it("'all' geçerli bir değerdir", () => {
    expect(normalizeCategories(["all"])).toEqual(["all"]);
  });

  it("en fazla 11 öğe döner (10 kategori + all)", () => {
    const input = [
      "Gündem",
      "Teknoloji",
      "Ekonomi",
      "Siyaset",
      "Spor",
      "Bilim",
      "Dünya",
      "Sağlık",
      "Kültür",
      "Diğer",
      "all",
      "Teknoloji", // 12. aday — kesilir
    ];
    const result = normalizeCategories(input);
    expect(result.length).toBeLessThanOrEqual(11);
  });

  it("tüm kategori değerleri kabul edilir", () => {
    expect(normalizeCategories(["Gündem", "Dünya", "Sağlık", "Kültür"])).toEqual([
      "Gündem",
      "Dünya",
      "Sağlık",
      "Kültür",
    ]);
  });
});

// ─── shouldAutoPush ──────────────────────────────────────────────────────────

describe("shouldAutoPush", () => {
  const MINUTE = 60 * 1000;
  const NOW = 1_000_000_000;

  it("3+ kaynak ve önceki gönderim yok → true", () => {
    expect(shouldAutoPush({ sourcesCount: 3 }, null, NOW)).toBe(true);
    expect(shouldAutoPush({ sourcesCount: 5 }, null, NOW)).toBe(true);
  });

  it("2 kaynak → false (kaynak şartı)", () => {
    expect(shouldAutoPush({ sourcesCount: 2 }, null, NOW)).toBe(false);
    expect(shouldAutoPush({ sourcesCount: 0 }, null, NOW)).toBe(false);
  });

  it("30 dakika içinde tekrar → false", () => {
    expect(
      shouldAutoPush({ sourcesCount: 3 }, NOW - 29 * MINUTE, NOW),
    ).toBe(false);
    expect(
      shouldAutoPush({ sourcesCount: 3 }, NOW - 10 * MINUTE, NOW),
    ).toBe(false);
  });

  it("31 dakika sonra → true", () => {
    expect(
      shouldAutoPush({ sourcesCount: 3 }, NOW - 31 * MINUTE, NOW),
    ).toBe(true);
  });

  it("2 kaynak + süre geçti → yine false (kaynak şartı önce)", () => {
    expect(
      shouldAutoPush({ sourcesCount: 2 }, NOW - 60 * MINUTE, NOW),
    ).toBe(false);
  });
});

// ─── buildPushPayload ────────────────────────────────────────────────────────

describe("buildPushPayload", () => {
  it("url ve tag doğru kurulur", () => {
    const payload = buildPushPayload(
      { id: "abc123", title: "Test haberi", category: "Teknoloji" },
      "emirtahaatar.com.tr",
    );

    expect(payload).toEqual({
      title: "emirtahaatar.com.tr",
      body: "Test haberi",
      url: "/tr/news/abc123",
      tag: "Teknoloji",
    });
  });

  it("title site adı parametresinden gelir", () => {
    const payload = buildPushPayload(
      { id: "x", title: "Başlık", category: "Spor" },
      "Site Adı",
    );
    expect(payload.title).toBe("Site Adı");
    expect(payload.body).toBe("Başlık");
  });
});
