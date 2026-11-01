import { describe, expect, it } from "vitest";
import { buildDigestBody, istanbulDate } from "@/lib/digest";

/**
 * FAZ 4.1 — günlük özet testleri.
 * Özet deterministik olmalı: aynı girdi → aynı metin, uydurma yok.
 */

const items = [
  { id: "1", title: "Merkez Bankası faizi 250 baz puan indirdi", slug: "a", category: "Ekonomi" },
  { id: "2", title: "Borsa İstanbul günü rekorla kapattı", slug: "b", category: "Ekonomi" },
  { id: "3", title: "Yeni çip fabrikası açıldı", slug: "c", category: "Teknoloji" },
];

describe("Günün özeti — gövde metni", () => {
  it("3-5 cümle arası üretir", () => {
    const body = buildDigestBody(items, "2026-11-01");
    const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(3);
    expect(sentences.length).toBeLessThanOrEqual(5);
  });

  it("haber başlıklarını alıntı olarak kullanır (atıf)", () => {
    const body = buildDigestBody(items, "2026-11-01");
    expect(body).toContain("Merkez Bankası faizi 250 baz puan indirdi");
  });

  it("kategori dağılımını yansıtır", () => {
    const body = buildDigestBody(items, "2026-11-01");
    expect(body).toContain("Ekonomi");
  });

  it("haber yoksa boş özet üretir, uydurmaz", () => {
    const body = buildDigestBody([], "2026-11-01");
    expect(body).toContain("haber bulunmuyor");
    expect(body).not.toMatch(/Merkez Bankası|Borsa/);
  });

  it("aynı girdi için deterministiktir", () => {
    expect(buildDigestBody(items, "2026-11-01")).toBe(buildDigestBody(items, "2026-11-01"));
  });

  it("tek haberle de çalışır", () => {
    const body = buildDigestBody([items[0]], "2026-11-01");
    expect(body.length).toBeGreaterThan(40);
    expect(body).toContain("1 gelişme");
  });
});

describe("Tarih — Europe/Istanbul", () => {
  it("gün sınırını doğru hesaplar", () => {
    // 2026-11-01 22:00 UTC = 2026-11-02 01:00 TSİ → ertesi gün
    expect(istanbulDate(new Date("2026-11-01T22:00:00Z"))).toBe("2026-11-02");
    // 2026-11-01 20:00 UTC = 23:00 TSİ → aynı gün
    expect(istanbulDate(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-01");
  });
});
