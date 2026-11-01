import { describe, expect, it } from "vitest";
import { extractEntities, normalizeNumber, runFactCheck } from "@/lib/fact-check";

/**
 * FAZ 1.1 — doğrulama adımı testleri.
 *
 * Amaç: özetteki sayı/tarih/isim kaynakta yoksa haber YAYINA ALINMAZ.
 */

const SOURCE = [
  "Merkez Bankası politika faizini 250 baz puan indirdi. Yeni faiz oranı yüzde 42,5 oldu. " +
    "Karar 27 Ekim 2026 tarihinde açıklandı. Mehmet Şimşek kararı değerlendirdi.",
];

describe("Doğrulama — sayı karşılaştırma", () => {
  it("kaynakta geçen sayılarla yazılmış özet geçer", () => {
    const result = runFactCheck({
      title: "",
      summary: "Merkez Bankası politika faizini 250 baz puan indirdi; yeni oran %42,5.",
      sources: SOURCE,
    });

    expect(result.status).toBe("ok");
    expect(result.publishable).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("uydurulmuş sayı yakalanır ve yayın engellenir", () => {
    const result = runFactCheck({
      title: "",
      summary: "Merkez Bankası politika faizini 400 baz puan indirdi.",
      sources: SOURCE,
    });

    expect(result.status).toBe("review");
    expect(result.publishable).toBe(false);
    expect(result.violations.some((v) => v.kind === "number" && v.value.includes("400"))).toBe(true);
  });

  it("Türkçe sayı biçimi normalize edilir (1.250 → 1250)", () => {
    expect(normalizeNumber("1.250")).toBe("1250");
    expect(normalizeNumber("%42,5")).toBe("42.5");
    expect(normalizeNumber("3,5 milyar")).toBe("3.5");
  });
});

describe("Doğrulama — tarih karşılaştırma", () => {
  it("kaynakta geçen tarih geçer", () => {
    const result = runFactCheck({
      title: "",
      summary: "Karar 27 Ekim 2026 tarihinde açıklandı.",
      sources: SOURCE,
    });

    expect(result.publishable).toBe(true);
  });

  it("uydurulmuş tarih yakalanır", () => {
    const result = runFactCheck({
      title: "",
      summary: "Karar 15 Aralık 2029 tarihinde açıklandı.",
      sources: SOURCE,
    });

    expect(result.publishable).toBe(false);
    expect(result.violations.some((v) => v.kind === "date")).toBe(true);
  });
});

describe("Doğrulama — özel isim", () => {
  it("kaynakta geçen kişi adı geçer", () => {
    const result = runFactCheck({
      title: "",
      summary: "Merkez Bankası kararını Mehmet Şimşek değerlendirdi.",
      sources: SOURCE,
    });

    expect(result.publishable).toBe(true);
  });

  it("kaynakta olmayan kişi adı yakalanır", () => {
    const result = runFactCheck({
      title: "",
      summary: "Merkez Bankası kararını Ahmet Yıldız duyurdu.",
      sources: SOURCE,
    });

    expect(result.publishable).toBe(false);
    expect(result.violations.some((v) => v.kind === "entity")).toBe(true);
  });

  it("özel ad çıkarımı cümle başındaki sıradan kelimeleri atlar", () => {
    const entities = extractEntities("Bu haber yeni bir gelişmeyi anlatıyor. Nvidia çip üretti.");
    expect(entities.join(" ")).toContain("Nvidia");
    expect(entities.join(" ").toLowerCase()).not.toContain("bu haber");
  });
});

describe("Doğrulama — kaynak yoksa", () => {
  it("kaynak metni yoksa yayın engellenir", () => {
    const result = runFactCheck({ title: "", summary: "Bir haber.", sources: ["kısa"] });
    expect(result.publishable).toBe(false);
    expect(result.status).toBe("review");
  });
});

describe("Doğrulama — yanlış pozitif kontrolü", () => {
  it("kaynakla birebir örtüşen uzun özet geçer", () => {
    const result = runFactCheck({
      title: "Merkez Bankası faiz kararı",
      summary:
        "Merkez Bankası politika faizini 250 baz puan indirdi. Yeni faiz oranı yüzde 42,5 oldu.",
      sources: SOURCE,
    });

    expect(result.publishable).toBe(true);
  });
});
