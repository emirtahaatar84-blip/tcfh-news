import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Token dışı px kalmadı mı" kod taraması.
 *
 * Kural: boşluk utilities (p/m/gap/space) yalnızca token anahtarlarını
 * kullanabilir. Bileşen boyutları (h/w/min-h/max-w/inset) ayrı ölçekte
 * olduğu için bu taramanın dışındadır.
 */

const ALLOWED_KEYS = new Set([
  ...Array.from({ length: 11 }, (_, index) => `space-${index}`),
  "px",
  "auto",
  "card-y",
  "card-x",
  "card-gap",
  "section-gap",
  "title-body",
  "title-spot",
  "spot-meta",
  "inline",
  "top-gap",
  "block-gap",
  "column-gap",
  "block-breath",
  "bottom-nav-gap",
  "rail-gap",
  "touch",
  "after-header",
]);

const SPACING_UTIL =
  /(?:^|[\s"'`])(?:-)?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap-x|gap-y|gap|space-x|space-y)-([a-z0-9-]+)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = [...walk("app"), ...walk("components")];

describe("token taraması — boşluk sınıfları", () => {
  it("boşluk utilities yalnızca token anahtarı kullanır", () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(SPACING_UTIL)) {
        const key = match[1];

        // `gap-x` gibi utilities'te anahtar ayrımı: son parça anahtardır.
        if (ALLOWED_KEYS.has(key)) continue;

        // `space-x-4` gibi numeric anahtarlar kaldırıldı → yakalanır.
        violations.push(`${file}: ${match[0].trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("boşluk utilities içinde ham px (arbitrary) yok", () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      const pattern =
        /(?:^|[\s"'`])(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-\[[^\]]*px\][^\s"'`]*/g;

      for (const match of source.matchAll(pattern)) {
        violations.push(`${file}: ${match[0].trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("üretilen token dosyasında ölçek dışı px yok", () => {
    const css = readFileSync("app/generated/tokens.css", "utf8");
    const tokens = [...css.matchAll(/--space-\d+:\s*([0-9.]+)rem/g)].map((m) =>
      Number(m[1]) * 16,
    );

    expect(tokens.length).toBe(11);
    for (const value of tokens) {
      expect(value % 4).toBe(0);
    }
  });
});
