import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidSlug, shortenSlug, slugify } from "@/lib/slug";
import {
  buildFullDocument,
  buildSummaryDocument,
  estimateSeconds,
  splitSentences,
  textForSpeech,
} from "@/lib/speech-text";

describe("slug — yeni URL şeması", () => {
  it("Türkçe karakterleri ASCII'ye çevirir", () => {
    expect(slugify("SİPER Ürün-2: Havada Hedef Değiştiren Füze")).toBe(
      "siper-urun-2-havada-hedef-degistiren",
    );
  });

  it("en fazla 6 kelime üretir", () => {
    const slug = slugify(
      "Bir iki üç dört beş altı yedi sekiz dokuz on onbir oniki",
    );
    expect(slug.split("-").length).toBeLessThanOrEqual(6);
    expect(slug).toBe("bir-iki-uc-dort-bes-alti");
  });

  it("geçerli slug deseni", () => {
    expect(isValidSlug("siper-urun-2-havada")).toBe(true);
    expect(isValidSlug("Siper-Urun")).toBe(false);
    expect(isValidSlug("-bas")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
  });

  it("uzun slug'ı 6 kelimeye indirir", () => {
    expect(shortenSlug("a-b-c-d-e-f-g-h")).toBe("a-b-c-d-e-f");
  });
});

describe("cümle bölme — sesli okuma", () => {
  it("basit cümleleri böler", () => {
    const sentences = splitSentences(
      "Füze havada yeni hedefini imha etti. Test başarıyla tamamlandı ve sistem doğrulandı. Sonuçlar kamuoyuyla paylaşıldı.",
    );
    expect(sentences).toHaveLength(3);
  });

  it("kısaltmalardan sonra bölmez (Prof. Dr.)", () => {
    const sentences = splitSentences(
      "Prof. Dr. Haluk Görgün açıklama yaptı. Test başarılı oldu.",
    );
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("Prof. Dr. Haluk Görgün");
  });

  it("ondalık sayıyı bölmez (1.5 milyar)", () => {
    const sentences = splitSentences(
      "Yatırım 1.5 milyar liraya ulaştı. Bu rekor bir seviyedir.",
    );
    expect(sentences[0]).toContain("1.5 milyar");
  });

  it("çok kısa parçayı önceki cümleye ekler", () => {
    const sentences = splitSentences(
      "Sistem başarıyla test edildi ve hedef imha edildi. Evet.",
    );
    expect(sentences).toHaveLength(1);
  });

  it("boş metin için boş dizi döner", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("sesli okuma dokümanları", () => {
  const summary = buildSummaryDocument({
    contentId: "portre:test",
    title: "SİPER Ürün-2 hedef değiştirdi",
    url: "/tr/portre/test",
    coverImageUrl: null,
    subtitle:
      "Türkiye'nin uzun menzilli hava savunma sistemi yeni bir testi başarıyla tamamladı.",
    bullets: [
      "Füze uçuş sırasında yeni hedefe yönlendirildi.",
      "Test Savunma Sanayii Başkanlığı koordinasyonunda yapıldı.",
      "Sistemin menzili artırıldı.",
    ],
  });

  it("özet 60-90 saniye aralığında kalır", () => {
    expect(summary.estimatedSeconds).toBeGreaterThanOrEqual(10);
    expect(summary.estimatedSeconds).toBeLessThanOrEqual(180);
    expect(summary.mode).toBe("summary");
    expect(summary.sentences.length).toBeGreaterThan(0);
  });

  it("tam metin kronoloji ve SSS dahil, kaynak numaraları hariç", () => {
    const full = buildFullDocument({
      contentId: "portre:test",
      title: "Başlık",
      url: "/tr/portre/test",
      coverImageUrl: null,
      subtitle: "Tek cümle.",
      sections: [
        { heading: "Neden gündemde", paragraphs: ["Birinci madde.[1]"] },
        { heading: "Kronoloji", paragraphs: ["2026-10-25. Olay gerçekleşti.[2]"] },
        { heading: "Sık sorulanlar", paragraphs: ["Soru? Cevap.[3]"] },
      ],
    });

    const joined = full.sentences.join(" ");

    expect(joined).toContain("Kronoloji");
    expect(joined).toContain("Sık sorulanlar");
    expect(joined).not.toContain("[1]");
    expect(joined).not.toContain("[2]");
  });

  it("metin temizliği kaynak numaralarını ve madde işaretlerini atar", () => {
    const cleaned = textForSpeech("• Birinci madde [1]. – İkinci madde [2].");
    expect(cleaned).not.toContain("[1]");
    expect(cleaned).not.toContain("•");
    expect(cleaned).toContain("Birinci madde");
  });

  it("süre tahmini hızla ters orantılı", () => {
    const base = estimateSeconds("a".repeat(200), 1);
    const faster = estimateSeconds("a".repeat(200), 2);
    expect(faster).toBeLessThan(base);
  });
});

describe("KVKK — sesli okuma istemci tarafında", () => {
  it("sesli okuma kodu hiçbir ağ isteği yapmaz", () => {
    const files = [
      "lib/speech-text.ts",
      "components/media/MediaProvider.tsx",
      "components/media/ListenControls.tsx",
      "components/media/MediaBar.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/fetch\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
      expect(source).not.toMatch(/navigator\.sendBeacon/);
      expect(source).not.toMatch(/https?:\/\/[^\s"']*tts/i);
    }
  });

  it("Web Speech API kullanılır, sunucu TTS'i değil", () => {
    const provider = readFileSync("components/media/MediaProvider.tsx", "utf8");
    expect(provider).toContain("speechSynthesis");
    expect(provider).toContain("SpeechSynthesisUtterance");
    expect(provider).not.toMatch(/\/api\/news\/[^`]*audio/);
  });

  it("proxy çerez yazmaz", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).not.toMatch(/cookies\.set/);
    expect(proxy).not.toMatch(/NEXT_LOCALE/);
  });

  it("localStorage şeması sürümlüdür", () => {
    const store = readFileSync("lib/local-store.ts", "utf8");
    expect(store).toContain('STORAGE_VERSION = 1');
    expect(store).toContain("storageVersion");
  });
});

describe("bilgi mimarisi", () => {
  it("yeni URL şeması sayfaları mevcut", () => {
    expect(() => readFileSync("app/[lang]/haber/[slug]/page.tsx", "utf8")).not.toThrow();
    expect(() => readFileSync("app/[lang]/portre/[slug]/page.tsx", "utf8")).not.toThrow();
    expect(() => readFileSync("app/[lang]/portreler/page.tsx", "utf8")).not.toThrow();
    expect(() => readFileSync("app/[lang]/kategoriler/page.tsx", "utf8")).not.toThrow();
    expect(() => readFileSync("app/[lang]/ara/page.tsx", "utf8")).not.toThrow();
  });

  it("eski URL'ler route handler ile 308 döner", () => {
    const news = readFileSync("app/[lang]/news/[id]/route.ts", "utf8");
    const portrait = readFileSync("app/[lang]/portreler/[slug]/route.ts", "utf8");

    for (const source of [news, portrait]) {
      expect(source).toContain("308");
      expect(source).toContain("Location");
      // Göreli Location: konteyner içi host sızmamalı.
      expect(source).not.toContain("new URL(`/");
    }
  });

  it("ana akış üç kolonlu sonsuz akış; portreler sağ kolonda ve serpiştirilmiş", () => {
    const home = readFileSync("app/[lang]/page.tsx", "utf8");
    const page = readFileSync("components/feed/FeedPage.tsx", "utf8");
    const right = readFileSync("components/layout/RightRail.tsx", "utf8");
    const feed = readFileSync("components/Feed.tsx", "utf8");

    expect(home).toContain("FeedView");
    expect(page).toContain("ThreeColumn");
    expect(page).toContain("summary={summary}");
    expect(right).toContain("dict.home.todaySummary");
    expect(right).toContain("PortraitCard");
    expect(feed).toContain("PortraitFeedCard");
    // "Daha fazla yükle" butonu kaldırıldı; yerine noscript bağlantısı var.
    expect(feed).not.toContain("Daha fazla yükle");
    expect(feed).toContain("<noscript>");
  });

  it("speakable JSON-LD işaretlemesi var", () => {
    const seo = readFileSync("lib/content-seo.ts", "utf8");
    expect(seo).toContain("SpeakableSpecification");
    expect(seo).toContain("NewsArticle");
    expect(seo).toContain("BreadcrumbList");
  });

  it("portreler varsayılan olarak onay bekler", () => {
    const pipeline = readFileSync("lib/portrait-pipeline.ts", "utf8");
    expect(pipeline).toMatch(/PORTRAIT_AUTO_PUBLISH \?\? "false"/);
  });
});
