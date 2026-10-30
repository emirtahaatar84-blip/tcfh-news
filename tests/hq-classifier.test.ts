import { describe, expect, it } from "vitest";
import { classifyArticle } from "@/lib/hq/classifier";
import { CLASSIFIER } from "@/lib/hq/config";

/**
 * İŞ 3.1 — kategori sınıflandırma test seti.
 *
 * Set A: sözlüğün yazıldığı temel 30 başlık.
 * Set D: sözlük genişletildikten SONRA yazılan nihai held-out 10 başlık.
 */
const SET_A: { title: string; spot: string; expected: string }[] = [
  { title: "Merkez Bankası politika faizini 250 baz puan indirdi", spot: "TCMB, politika faizini yüzde 42,5'e çekti.", expected: "Ekonomi" },
  { title: "Enflasyon ekimde yüzde 38,2 oldu", spot: "TÜİK verilerine göre yıllık enflasyon geriledi.", expected: "Ekonomi" },
  { title: "Borsa İstanbul günü rekorla kapattı", spot: "BIST 100 endeksi yüzde 2,4 yükseldi.", expected: "Ekonomi" },
  { title: "Asgari ücret için ilk toplantı aralıkta yapılacak", spot: "Komisyon asgari ücret görüşmelerinin takvimini açıkladı.", expected: "Ekonomi" },
  { title: "Apple yeni çipini tanıttı", spot: "Şirket M5 işlemcisini duyurdu.", expected: "Teknoloji" },
  { title: "TSMC 2 nanometre üretime başladı", spot: "Tayvanlı üretici yeni nanometre sürecinde seri üretime geçti.", expected: "Teknoloji" },
  { title: "Siber saldırı bankaları hedef aldı", spot: "Uzmanlar kimlik avı yazılımıyla yapılan saldırılarda artış olduğunu bildirdi.", expected: "Teknoloji" },
  { title: "Yeni iPhone modeli satışa çıktı", spot: "Apple akıllı telefon serisinin yeni modelini Türkiye'de satışa sundu.", expected: "Teknoloji" },
  { title: "ChatGPT'ye görsel üretim özelliği geldi", spot: "OpenAI sohbet botuna yeni üretimsel yapay zeka araçları ekledi.", expected: "Yapay Zekâ" },
  { title: "OpenAI yeni dil modelini duyurdu", spot: "Şirket çok dilli görevlerde başarısı artan bir LLM tanıttı.", expected: "Yapay Zekâ" },
  { title: "Nvidia veri merkezi çipleriyle rekor kırdı", spot: "Üretici yapay zeka donanımı talebinin gelirlerini ikiye katladığını açıkladı.", expected: "Yapay Zekâ" },
  { title: "TBMM yeni yargı paketini kabul etti", spot: "Meclis Genel Kurulu'nda kabul edilen kanun teklifi mahkemelerin iş yükünü azaltmayı hedefliyor.", expected: "Siyaset" },
  { title: "Muhalefet seçim stratejisini açıkladı", spot: "Parti yönetimi yerel seçim öncesi yol haritasını duyurdu.", expected: "Siyaset" },
  { title: "Cumhurbaşkanı kabineyi topladı", spot: "Beştepe'deki toplantıda ekonomi ve dış politika gündemi ele alındı.", expected: "Siyaset" },
  { title: "Fenerbahçe derbide Galatasaray'ı 2-1 yendi", spot: "Süper Lig'de oynanan maçta gol son dakikada geldi.", expected: "Spor" },
  { title: "Milli takımın aday kadrosu açıklandı", spot: "Teknik direktör futbolcuların listesini duyurdu.", expected: "Spor" },
  { title: "Süper Lig'de şampiyonluk yarışı kızıştı", spot: "Ligin son haftalarında puan farkı azaldı.", expected: "Spor" },
  { title: "NASA Mars'ta su izi buldu", spot: "Uzay ajansı gezegende sıvı su kalıntısına işaret eden verileri paylaştı.", expected: "Bilim" },
  { title: "TÜBİTAK yeni araştırma programını duyurdu", spot: "Kurum genç bilim insanlarına yönelik destek programını başlattı.", expected: "Bilim" },
  { title: "Bilim insanları yeni gezegen keşfetti", spot: "Araştırma ekibi yaşanabilir bölgede bir gezegen tespit etti.", expected: "Bilim" },
  { title: "ABD yeni yaptırım paketini açıkladı", spot: "Beyaz Saray ihracat kısıtlamalarını genişlettiğini duyurdu.", expected: "Dünya" },
  { title: "NATO zirvesinde kritik karar", spot: "Zirvede savunma harcamalarına ilişkin yeni hedefler kabul edildi.", expected: "Dünya" },
  { title: "Rusya ile Çin arasında enerji anlaşması", spot: "İki ülke doğal gaz sevkiyatına ilişkin mutabakat imzaladı.", expected: "Dünya" },
  { title: "Sağlık Bakanlığı grip aşısı kampanyası başlattı", spot: "Bakanlık riskli gruplar için ücretsiz aşı uygulamasını duyurdu.", expected: "Sağlık" },
  { title: "Yeni salgın vakaları hastaneleri zorluyor", spot: "Uzmanlar vaka sayısındaki artışa karşı kapasitenin izlendiğini bildirdi.", expected: "Sağlık" },
  { title: "Cannes'da Türk filmi ödül aldı", spot: "Festivalde gösterilen sinema filmi jüri özel ödülüne layık görüldü.", expected: "Kültür" },
  { title: "Sinema salonları yeni sezona hazırlanıyor", spot: "Sektör temsilcileri film gösterim takvimini açıkladı.", expected: "Kültür" },
  { title: "İstanbul'da 4,2 büyüklüğünde deprem", spot: "AFAD merkez üssü Marmara Denizi olan sarsıntıyı duyurdu.", expected: "Gündem" },
  { title: "Meteoroloji 12 il için turuncu kod verdi", spot: "Genel Müdürlük kuvvetli fırtına ve yağış uyarısında bulundu.", expected: "Gündem" },
  { title: "AFAD sel bölgesinde çalışmaları sürdürüyor", spot: "Ekipler sel nedeniyle kapanan yolları açmaya devam ediyor.", expected: "Gündem" },
];

const SET_D: { title: string; spot: string; expected: string }[] = [
  { title: "Konkordato başvuruları arttı", spot: "Mahkeme kayıtları borç yapılandırma taleplerinin yükseldiğini gösterdi.", expected: "Ekonomi" },
  { title: "Katlanabilir telefon satışları hızlandı", spot: "Pazar araştırması ekran teknolojisine talebin arttığını ortaya koydu.", expected: "Teknoloji" },
  { title: "Voleybol milli takımı finale kaldı", spot: "Yarı finalde rakibini yenen ekip kupa için sahaya çıkacak.", expected: "Spor" },
  { title: "Aşı takviminde yeni düzenleme", spot: "Bakanlık çocukluk çağı aşılarında uygulama değişikliğini duyurdu.", expected: "Sağlık" },
  { title: "Kuyruklu yıldız Dünya'dan görülecek", spot: "Gök bilimciler gözlem için en uygun saatleri paylaştı.", expected: "Bilim" },
  { title: "Fırtına nedeniyle okullar tatil edildi", spot: "Valilik kuvvetli yağış beklentisi üzerine karar verdi.", expected: "Gündem" },
  { title: "Almanya koalisyon görüşmelerinde sona yaklaştı", spot: "Partiler hükümet programı üzerinde uzlaşma arayışında.", expected: "Dünya" },
  { title: "Roman ödülü bu yıl iki yazara verildi", spot: "Jüri edebiyat alanındaki katkıları gerekçe gösterdi.", expected: "Kültür" },
  { title: "Yargı reformu paketi komisyondan geçti", spot: "Teklif Genel Kurul'da görüşülecek.", expected: "Siyaset" },
  { title: "Rüzgâr enerjisi kapasitesi rekor kırdı", spot: "Sektör raporu kurulu gücün arttığını açıkladı.", expected: "Ekonomi" },
];

function accuracy(set: typeof SET_A): number {
  let correct = 0;
  for (const item of set) {
    if (classifyArticle({ title: item.title, spot: item.spot }).primary === item.expected) correct += 1;
  }
  return (correct / set.length) * 100;
}

describe("Kategori sınıflandırma", () => {
  it("temel set (30 başlık) ≥ %95 doğruluk", () => {
    expect(accuracy(SET_A)).toBeGreaterThanOrEqual(95);
  });

  it("nihai held-out set (10 başlık) ≥ %85 doğruluk", () => {
    expect(accuracy(SET_D)).toBeGreaterThanOrEqual(85);
  });

  it("her sonuç en fazla 5 etiket üretir ve ilk etiket @kategori-slug biçimindedir", () => {
    for (const item of SET_A) {
      const result = classifyArticle({ title: item.title, spot: item.spot });
      expect(result.tags.length).toBeLessThanOrEqual(CLASSIFIER.maxTagsTotal);
      expect(result.tags[0]).toMatch(/^@[a-z0-9-]+$/);
    }
  });

  it("ikincil etiketler en fazla 2 tanedir", () => {
    for (const item of SET_A) {
      const result = classifyArticle({ title: item.title, spot: item.spot });
      expect(result.secondary.length).toBeLessThanOrEqual(CLASSIFIER.maxSecondary);
    }
  });

  it("hiç sinyal yoksa 'belirsiz' işaretlenir ve Diğer olur", () => {
    const result = classifyArticle({ title: "Zzqw Xyvv", spot: "Qqww zzxx" });
    expect(result.ambiguous).toBe(true);
    expect(result.primary).toBe("Diğer");
  });

  it("feed varsayılanı sınıflandırmayı yönlendirir", () => {
    const withoutFeed = classifyArticle({ title: "Zzqw Xyvv", spot: "Qqww zzxx" });
    const withFeed = classifyArticle({ title: "Zzqw Xyvv", spot: "Qqww zzxx", feedCategory: "Spor" });
    expect(withoutFeed.primary).toBe("Diğer");
    expect(withFeed.primary).toBe("Spor");
  });
});
