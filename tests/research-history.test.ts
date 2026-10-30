import { describe, expect, it } from "vitest";
import { buildQueries, detectTemporalContext } from "@/lib/research";

/**
 * GEÇMİŞE YÖNELİK ARAŞTIRMA.
 *
 * Dava, soruşturma, "ilk kez hakim karşısına çıktı" gibi olaylar geçmişe
 * dayanır. Algoritma yalnızca "şu an ne oldu" değil, "önceden ne oldu" da
 * araştırmalı. Bu testler o davranışı kilitler.
 */

const baseStory = {
  key: "test",
  title: "",
  url: "https://kantan.news/haber/test",
  originalUrl: "https://kantan.news/haber/test",
  publishedAt: new Date("2026-10-27T10:00:00Z"),
  summary: "",
  category: "Gündem",
  tags: [] as string[],
  imageUrl: null,
  imageCredit: null,
  externalId: null,
};

function story(title: string, summary = "") {
  return { ...baseStory, title, summary };
}

describe("Geçmiş bağlamı tespiti", () => {
  it("dava haberi için arşiv sorguları üretir", () => {
    const queries = detectTemporalContext(
      story(
        "Sadettin Saran Uyuşturucu Ticareti Davasında İlk Kez Hakim Karşısına Çıktı",
        "Davada ilk duruşma başladı.",
      ),
    );

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.join(" ")).toMatch(/dava|soruşturma/i);
  });

  it("iddianame/soruşturma içeren haberde geçmiş sorgusu üretir", () => {
    const queries = detectTemporalContext(
      story("İddianame tamamlandı", "Soruşturma iki yıldır sürüyor."),
    );
    expect(queries.length).toBeGreaterThan(0);
  });

  it("vefat haberi için özgeçmiş sorgusu üretir", () => {
    const queries = detectTemporalContext(
      story("Ünlü yönetmen hayatını kaybetti", "Sanatçı 82 yaşındaydı."),
    );
    expect(queries.join(" ")).toMatch(/özgeçmiş|geçmiş/i);
  });

  it("sıradan bir ürün haberi için geçmiş sorgusu ÜRETMEZ", () => {
    const queries = detectTemporalContext(
      story("Apple yeni çipini tanıttı", "M5 işlemcisi duyuruldu."),
    );
    expect(queries).toHaveLength(0);
  });
});

describe("Sorgu üretimi — geçmiş sorguları dahil", () => {
  it("dava haberinde geçmiş sorguları genel sorgularla birleşir", () => {
    const queries = buildQueries(
      story(
        "Sadettin Saran Uyuşturucu Ticareti Davasında İlk Kez Hakim Karşısına Çıktı",
        "Davada ilk duruşma başladı.",
      ),
      "Sadettin Saran",
    );

    expect(queries.length).toBeGreaterThan(4);
    expect(queries.length).toBeLessThanOrEqual(8);
    // Hem güncel hem geçmiş bağlam araması olmalı.
    expect(queries.join(" ")).toMatch(/dava geçmişi|soruşturma/i);
    expect(queries.join(" ")).toMatch(/Sadettin Saran/i);
  });

  it("sorgu sayısı en fazla 8", () => {
    const queries = buildQueries(
      story("Çok uzun bir başlık burada deneme amacıyla yazıldı ve devam ediyor", "özet"),
      "Konu",
    );
    expect(queries.length).toBeLessThanOrEqual(8);
  });
});
