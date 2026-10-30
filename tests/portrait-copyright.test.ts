import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { portraitFallbackSvg } from "@/lib/portrait-image";

/**
 * Telif koruma testleri: portre kapakları yalnızca kendi üretimimiz olabilir.
 * Dış kaynak (haber ajansı / kantan.news) görsel URL'i hiçbir kod yolundan
 * kapak olarak atanmamalıdır.
 */

describe("portre kapak görselleri — telif koruması", () => {
  it("SVG fallback kendi içinde üretilir, dış kaynak referansı taşımaz", () => {
    const svg = portraitFallbackSvg("Gündem", 12345);

    expect(svg).toContain("<svg");
    // xmlns ad alanı dışında hiçbir dış URL olmamalı.
    const withoutNamespace = svg.replace(
      /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,
      "",
    );
    expect(withoutNamespace).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<image\b/);
    expect(svg).not.toMatch(/xlink:href/);
  });

  it("fallback deterministiktir (aynı tohum → aynı çıktı)", () => {
    expect(portraitFallbackSvg("Ekonomi", 42)).toBe(
      portraitFallbackSvg("Ekonomi", 42),
    );
    expect(portraitFallbackSvg("Ekonomi", 42)).not.toBe(
      portraitFallbackSvg("Ekonomi", 43),
    );
  });

  it("pipeline dış kaynak görselini kapak olarak atamaz", () => {
    const source = readFileSync("lib/portrait-pipeline.ts", "utf8");

    // Regresyon koruması: story.imageUrl / story.imageCredit kopyalanmamalı.
    expect(source).not.toMatch(/coverImageUrl:\s*story\.imageUrl/);
    expect(source).not.toMatch(/coverImageCredit:\s*story\.imageCredit/);
    expect(source).toMatch(/coverImageUrl:\s*`\/api\/portraits\/\$\{portraitId\}\/image`/);
  });

  it("örnek portre verisi dış görsel URL'i içermez", () => {
    const raw = readFileSync("scripts/portrait-sample-data.json", "utf8");
    const data = JSON.parse(raw) as { data?: { coverImageUrl?: unknown } };

    const cover = data.data?.coverImageUrl;
    expect(cover === null || cover === undefined).toBe(true);
  });

  it("görsel ucu dış URL'den içerik servis etmez", () => {
    const source = readFileSync("app/api/portraits/[id]/image/route.ts", "utf8");

    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/redirect\(/);
  });
});

describe("akış yapısı", () => {
  it("ana akış üç kolonlu akış; portreler sağ kolonda ve akışa serpiştirilir", () => {
    const home = readFileSync("app/[lang]/page.tsx", "utf8");
    const right = readFileSync("components/layout/RightRail.tsx", "utf8");
    const feed = readFileSync("components/Feed.tsx", "utf8");

    expect(home).toContain("FeedView");
    expect(right).toContain("PortraitCard");
    expect(feed).toContain("PortraitFeedCard");
    expect(feed).toContain("IntersectionObserver");
  });

  it("/portreler dizini kendi sayfasıdır (yönlendirme yok)", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    const index = readFileSync("app/[lang]/portreler/page.tsx", "utf8");

    expect(config).not.toContain("/:lang(tr|en)/portreler");
    expect(index).toContain("PortraitCard");
    expect(index).toContain("PortraitFilters");
  });
});
