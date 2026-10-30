import { describe, expect, it } from "vitest";
import {
  adminPushSendSchema,
  pushSubscriptionCoreSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "@/lib/push";

// HTTP katmanı mock'suz test edilemez; burada yalnızca zod şemaları
// doğrulanır (geçersiz endpoint reddi vb.).

const VALID_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "a".repeat(20), auth: "b".repeat(20) },
};

// ─── pushSubscriptionCoreSchema ──────────────────────────────────────────────

describe("pushSubscriptionCoreSchema", () => {
  it("geçerli aboneliği kabul eder", () => {
    const result = pushSubscriptionCoreSchema.safeParse({
      endpoint: VALID_SUBSCRIPTION.endpoint,
      keys: { p256dh: "p256dh-degeri-uzun", auth: "auth-degeri-uzun" },
    });

    expect(result.success).toBe(true);
  });

  it("http (https olmayan) endpoint reddedilir", () => {
    const result = pushSubscriptionCoreSchema.safeParse({
      endpoint: "http://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "p256dh-degeri-uzun", auth: "auth-degeri-uzun" },
    });

    expect(result.success).toBe(false);
  });

  it("bozuk endpoint reddedilir", () => {
    const result = pushSubscriptionCoreSchema.safeParse({
      endpoint: "not-a-url",
      keys: { p256dh: "p256dh-degeri-uzun", auth: "auth-degeri-uzun" },
    });

    expect(result.success).toBe(false);
  });

  it("kısa p256dh/auth reddedilir (min 10 karakter)", () => {
    const result = pushSubscriptionCoreSchema.safeParse({
      endpoint: VALID_SUBSCRIPTION.endpoint,
      keys: { p256dh: "kisa", auth: "kisa" },
    });

    expect(result.success).toBe(false);
  });
});

// ─── pushSubscribeSchema ─────────────────────────────────────────────────────

describe("pushSubscribeSchema", () => {
  it("subscription + categories + locale kabul eder", () => {
    const result = pushSubscribeSchema.safeParse({
      subscription: VALID_SUBSCRIPTION,
      categories: ["Teknoloji"],
      locale: "tr",
    });

    expect(result.success).toBe(true);
  });

  it("subscription olmadan reddedilir", () => {
    const result = pushSubscribeSchema.safeParse({
      categories: ["Teknoloji"],
    });

    expect(result.success).toBe(false);
  });

  it("geçersiz locale reddedilir", () => {
    const result = pushSubscribeSchema.safeParse({
      subscription: VALID_SUBSCRIPTION,
      locale: "de",
    });

    expect(result.success).toBe(false);
  });
});

// ─── pushUnsubscribeSchema ───────────────────────────────────────────────────

describe("pushUnsubscribeSchema", () => {
  it("endpoint kabul eder", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: VALID_SUBSCRIPTION.endpoint,
    });

    expect(result.success).toBe(true);
  });

  it("boş endpoint reddedilir", () => {
    const result = pushUnsubscribeSchema.safeParse({ endpoint: "  " });

    expect(result.success).toBe(false);
  });
});

// ─── adminPushSendSchema ─────────────────────────────────────────────────────

describe("adminPushSendSchema", () => {
  it("title + body kabul eder", () => {
    const result = adminPushSendSchema.safeParse({
      title: "Duyuru",
      body: "Sitede bakım çalışması yapılacaktır.",
    });

    expect(result.success).toBe(true);
  });

  it("boş başlık reddedilir", () => {
    const result = adminPushSendSchema.safeParse({
      title: "  ",
      body: "İçerik",
    });

    expect(result.success).toBe(false);
  });

  it("opsiyonel url ve categories kabul eder", () => {
    const result = adminPushSendSchema.safeParse({
      title: "Duyuru",
      body: "İçerik",
      url: "/tr",
      categories: ["all"],
    });

    expect(result.success).toBe(true);
  });
});
