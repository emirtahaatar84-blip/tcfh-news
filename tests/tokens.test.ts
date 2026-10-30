import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BODY_STEPS,
  DENSITIES,
  DENSITY,
  PAGE_GUTTER,
  SPACE_SCALE,
  SPACING_ROLES,
  TYPE_SCALE,
  buildTokensCss,
  resolveAll,
  resolveRole,
  snapToScale,
  spacingThemeEntries,
} from "@/lib/design/tokens";

describe("aralık ölçeği — 8 pt", () => {
  it("yalnızca izin verilen 11 değer var", () => {
    expect(Object.values(SPACE_SCALE)).toEqual([
      0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128,
    ]);
  });

  it("her değer 4'ün katı", () => {
    for (const value of Object.values(SPACE_SCALE)) {
      expect(value % 4).toBe(0);
    }
  });

  it("snap yalnızca ölçek değeri döndürür", () => {
    for (const input of [1, 3, 5, 7, 10, 18, 22, 30, 40, 56, 70, 100, 130]) {
      expect(Object.values(SPACE_SCALE)).toContain(snapToScale(input));
    }
  });
});

describe("yoğunluk çarpanları — istenen tablo", () => {
  it("kart içi 12 / 16 / 24", () => {
    expect(resolveRole("cardY", "compact")).toBe(12);
    expect(resolveRole("cardY", "balanced")).toBe(16);
    expect(resolveRole("cardY", "comfortable")).toBe(24);
  });

  it("kartlar arası 16 / 24 / 32", () => {
    expect(resolveRole("cardGap", "compact")).toBe(16);
    expect(resolveRole("cardGap", "balanced")).toBe(24);
    expect(resolveRole("cardGap", "comfortable")).toBe(32);
  });

  it("bölümler arası 32 / 48 / 64", () => {
    expect(resolveRole("sectionGap", "compact")).toBe(32);
    expect(resolveRole("sectionGap", "balanced")).toBe(48);
    expect(resolveRole("sectionGap", "comfortable")).toBe(64);
  });

  it("sabit ilişkiler yoğunluktan etkilenmez", () => {
    for (const density of DENSITIES) {
      expect(resolveRole("titleSpot", density)).toBe(8);
      expect(resolveRole("spotMeta", density)).toBe(12);
      expect(resolveRole("inline", density)).toBe(8);
    }
  });

  it("tüm roller izin verilen ölçekte kalır", () => {
    for (const density of DENSITIES) {
      for (const value of Object.values(resolveAll(density))) {
        expect(Object.values(SPACE_SCALE)).toContain(value);
      }
    }
  });

  it("sıralı çarpanlar (1.00 / 1.25 / 1.50)", () => {
    expect(DENSITY.compact.multiplier).toBe(1);
    expect(DENSITY.balanced.multiplier).toBe(1.25);
    expect(DENSITY.comfortable.multiplier).toBe(1.5);
  });

  it("her rol tanımlı ve pozitif", () => {
    for (const role of Object.keys(SPACING_ROLES)) {
      expect(resolveRole(role as keyof typeof SPACING_ROLES, "balanced")).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("tipografi ölçeği", () => {
  it("gövde 17 px'in altına inmez", () => {
    expect(TYPE_SCALE.body.mobile).toBeGreaterThanOrEqual(16);
    expect(BODY_STEPS.sm).toBeGreaterThanOrEqual(16);
  });

  it("okuma ölçeği basamakları arasında en az 2 px fark var", () => {
    // label (12) ile meta (13) ürün şartnamesinde sabittir; okuma
    // basamakları ise birbirine 1 px'den yakın olamaz.
    // H3 ile gövde aynı boyuttadır (17) — ayrım ağırlıkla kurulur.
    const sizes = [
      TYPE_SCALE.meta.mobile,
      TYPE_SCALE.lead.mobile,
      TYPE_SCALE.body.mobile,
      TYPE_SCALE.h2.mobile,
      TYPE_SCALE.h1.mobile,
    ];
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i] - sizes[i - 1]).toBeGreaterThanOrEqual(2);
    }
    expect(TYPE_SCALE.h3.mobile).toBe(TYPE_SCALE.body.mobile);
    expect(TYPE_SCALE.meta.mobile).toBeGreaterThan(TYPE_SCALE.label.mobile);
  });

  it("Light/Thin ağırlık yok (>= 400)", () => {
    for (const entry of Object.values(TYPE_SCALE)) {
      expect(entry.weight).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("üretilen CSS", () => {
  it("app/generated/tokens.css kaynakla aynı", () => {
    const generated = readFileSync("app/generated/tokens.css", "utf8");
    expect(generated).toBe(buildTokensCss());
  });

  it("üç yoğunluk bloğu ve CSS değişkenleri var", () => {
    const css = buildTokensCss();
    for (const density of DENSITIES) {
      expect(css).toContain(`html[data-density="${density}"]`);
    }
    expect(css).toContain("--sp-card-y");
    expect(css).toContain("--sp-section-gap");
    expect(css).toContain("--type-h1-size");
  });

  it("Tailwind semantik anahtarları CSS değişkenine bağlı", () => {
    const entries = spacingThemeEntries();
    expect(entries["card-y"]).toBe("var(--sp-card-y)");
    expect(entries["section-gap"]).toBe("var(--sp-section-gap)");
    expect(entries["space-4"]).toBe("var(--space-4)");
  });

  it("sayfa boşluğu: 16 <390, 24 mobil/tablet, 48 geniş", () => {
    expect(PAGE_GUTTER.narrow).toBe(16);
    expect(PAGE_GUTTER.regular).toBe(24);
    expect(PAGE_GUTTER.tablet).toBe(24);
    expect(PAGE_GUTTER.wide).toBe(48);
  });
});
