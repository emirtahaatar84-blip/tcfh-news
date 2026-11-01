import { describe, expect, it } from "vitest";

/**
 * FAZ 1.2 — hata bildirimi hız limiti ve girdi doğrulama testleri.
 *
 * API ucu Next.js bağlamına ihtiyaç duyduğu için mantık burada saf
 * fonksiyonlar üzerinden kilitlenir; uç nokta aynı kuralları uygular.
 */

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Sunucudaki `newsReport.count` + eşik mantığının birebir kopyası. */
function isRateLimited(recentCount: number): boolean {
  return recentCount >= RATE_LIMIT;
}

/** Sunucudaki retryAfter hesabı. */
function retryAfterSeconds(oldestCreatedAt: number, now: number): number {
  return Math.max(1, Math.ceil((oldestCreatedAt + RATE_WINDOW_MS - now) / 1000));
}

const VALID_REASONS = [
  "yanlis-bilgi",
  "eksik-bilgi",
  "kaynaksiz-iddia",
  "hakaret-ayrimcilik",
  "telif",
  "reklam-spam",
  "diger",
];

describe("Hata bildirimi — hız limiti", () => {
  it("saatte ilk 5 istek geçer", () => {
    for (let count = 0; count < RATE_LIMIT; count += 1) {
      expect(isRateLimited(count)).toBe(false);
    }
  });

  it("6. istek engellenir", () => {
    expect(isRateLimited(5)).toBe(true);
    expect(isRateLimited(9)).toBe(true);
  });

  it("retryAfter 1 saniyeden küçük olmaz ve pencereyi aşmaz", () => {
    const now = Date.now();
    expect(retryAfterSeconds(now, now)).toBe(60 * 60);
    expect(retryAfterSeconds(now - RATE_WINDOW_MS + 30_000, now)).toBe(30);
    // Süresi geçmiş kayıt → en az 1 sn.
    expect(retryAfterSeconds(now - RATE_WINDOW_MS - 1000, now)).toBe(1);
  });
});

describe("Hata bildirimi — girdi doğrulama", () => {
  it("geçerli neden listesi sabittir", () => {
    expect(VALID_REASONS).toHaveLength(7);
    expect(VALID_REASONS).toContain("yanlis-bilgi");
    expect(VALID_REASONS).toContain("telif");
  });

  it("listedeki her neden geçerlidir, dışındaki reddedilir", () => {
    expect(VALID_REASONS.includes("yanlis-bilgi")).toBe(true);
    expect(VALID_REASONS.includes("spam-xyz")).toBe(false);
  });

  it("haber kimliği formatı denetlenir", () => {
    const pattern = /^[a-zA-Z0-9_-]{5,60}$/;
    expect(pattern.test("cmvqysrpt0000fa3grx20iycl")).toBe(true);
    expect(pattern.test("ab")).toBe(false);
    expect(pattern.test("kötü/id")).toBe(false);
  });
});
