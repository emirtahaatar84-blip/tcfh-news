import type { ContentRef } from "@/lib/hq/citation";

/**
 * İŞ 4.6 — 40 çiftlik atıf test seti.
 * POSITIVE: aynı olay, hedef daha eski (atıf kurulmalı).
 * NEGATIVE: farklı olay (atıf KURULMAMALI) — kategori/varlık kasıtlı ortak.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = Date.UTC(2026, 9, 20, 6, 0, 0); // 20 Ekim 2026 09:00 TSİ

function ref(
  id: string,
  kind: "haber" | "portre",
  title: string,
  text: string,
  category: string,
  publishedAt: number,
  clusterKey?: string,
): ContentRef {
  return { id, kind, title, text, category, publishedAt: new Date(publishedAt), clusterKey };
}

// ─── 20 DOĞRU çift ──────────────────────────────────────────────────────────
export type Pair = {
  label: string;
  current: ContentRef;
  target: ContentRef;
  sameEvent: boolean;
  sameCluster?: boolean;
};

export const POSITIVE: Pair[] = [
  ["TCMB faiz indirimi duyuruldu", "Merkez Bankası politika faizini 250 baz puan indirdi.", "TCMB faiz kararını açıkladı: politika faizi 250 baz puan düştü.", "Ekonomi"],
  ["Nvidia yeni çipini tanıttı", "Nvidia, veri merkezleri için Blackwell Ultra çipini duyurdu.", "Nvidia Blackwell Ultra çipinin seri üretime girdiğini açıkladı.", "Yapay Zekâ"],
  ["OpenAI model güncellemesi", "OpenAI yeni dil modelini kullanıma açtı.", "OpenAI, dil modelinin yeni sürümünü duyurdu.", "Yapay Zekâ"],
  ["TBMM yargı paketi", "TBMM Genel Kurulu yargı paketini kabul etti.", "TBMM Genel Kurulu'nda yargı paketi oy çokluğuyla kabul edildi.", "Siyaset"],
  ["Fenerbahçe derbi galibiyeti", "Fenerbahçe, Galatasaray'ı 2-1 yendi.", "Derbide Fenerbahçe sahadan 2-1 galip ayrıldı.", "Spor"],
  ["NASA Mars bulgusu", "NASA, Mars'ta sıvı su kalıntısı buldu.", "NASA'nın Mars keşfi sıvı su bulgusunu güçlendirdi.", "Bilim"],
  ["NATO zirvesi kararı", "NATO zirvesinde savunma harcaması hedefi kabul edildi.", "NATO liderleri zirvede harcama hedefini onayladı.", "Dünya"],
  ["Sağlık Bakanlığı aşı kampanyası", "Sağlık Bakanlığı grip aşısı kampanyasını başlattı.", "Grip aşısı kampanyası Sağlık Bakanlığı tarafından duyuruldu.", "Sağlık"],
  ["AFAD deprem açıklaması", "AFAD, Marmara Denizi merkezli depremi duyurdu.", "AFAD depremin büyüklüğünü 4,2 olarak açıkladı.", "Gündem"],
  ["Apple çip tanıtımı", "Apple M5 çipini tanıttı.", "Apple'ın yeni M5 çipi duyuruldu.", "Teknoloji"],
  ["TÜİK enflasyon verisi", "TÜİK ekim ayı enflasyonunu açıkladı.", "Enflasyon verisi TÜİK tarafından yayımlandı.", "Ekonomi"],
  ["Borsa İstanbul rekoru", "BIST 100 endeksi rekor seviyeden kapandı.", "Borsa İstanbul'da endeks rekorla kapandı.", "Ekonomi"],
  ["TÜBİTAK destek programı", "TÜBİTAK yeni araştırma destek programını başlattı.", "TÜBİTAK, genç araştırmacılar için program açtı.", "Bilim"],
  ["Cannes ödülü", "Cannes Film Festivali'nde Türk filmi ödül aldı.", "Türk sineması Cannes'dan ödülle döndü.", "Kültür"],
  ["Meteoroloji uyarısı", "Meteoroloji 12 il için turuncu kod uyarısı verdi.", "Meteoroloji Genel Müdürlüğü fırtına uyarısı yayımladı.", "Gündem"],
  ["ABD yaptırım paketi", "ABD yeni yaptırım paketini açıkladı.", "ABD yönetimi yaptırım listesini genişlettiğini duyurdu.", "Dünya"],
  ["Galatasaray transferi", "Galatasaray yeni transferini duyurdu.", "Galatasaray, orta saha transferini resmen açıkladı.", "Spor"],
  ["Yapay zekâ yönetmeliği", "Avrupa Birliği yapay zekâ yönetmeliğini kabul etti.", "Avrupa Birliği'nin yapay zekâ düzenlemesi onaylandı.", "Dünya"],
  ["Konut kredisi faizi", "Bankalar konut kredisi faizini düşürdü.", "Konut kredisi oranlarında indirim yapıldı.", "Ekonomi"],
  ["Süper Lig şampiyonluk", "Süper Lig'de şampiyonluk yarışı son haftaya kaldı.", "Süper Lig'de zirve yarışı son haftada belirlenecek.", "Spor"],
].map(([currentTitle, currentText, targetTitle, targetText, category], index) => ({
  label: `P${index + 1}`,
  sameEvent: true,
  sameCluster: true,
  current: ref(`c-pos-${index}`, "haber", currentTitle, currentText, category, BASE, `cluster-pos-${index}`),
  target: ref(`t-pos-${index}`, "haber", targetTitle, targetText, category, BASE - 3 * DAY, `cluster-pos-${index}`),
}));

// ─── 20 YANLIŞ çift ────────────────────────────────────────────────────────
export const NEGATIVE: Pair[] = [
  ["Apple AB yasası", "Apple, Avrupa Birliği'nin yeni dijital yasasına uyum sağlayacak.", "Apple WWDC 2025 açılış konuşmasını yaptı.", "Teknoloji", 200],
  ["Türkiye savunma siparişi", "Türkiye yeni savunma sistemi siparişi verdi.", "Türkiye'de turizm gelirleri rekor kırdı.", "Gündem", 40],
  ["Merkez Bankası faiz kararı", "Merkez Bankası faiz kararını açıkladı.", "Merkez Bankası yeni personel alımı yapacak.", "Ekonomi", 8],
  ["Hakan Fidan açıklaması", "Hakan Fidan yeni anlaşmayı duyurdu.", "Hakan Fidan kimdir: kariyeri ve görevleri.", "Siyaset", 15],
  ["Nvidia çip satışı", "Nvidia, veri merkezi çip satışlarını artırdı.", "Nvidia hisseleri analist beklentisinin altında kaldı.", "Yapay Zekâ", 5],
  ["TBMM bütçe görüşmesi", "TBMM bütçe görüşmelerine başladı.", "TBMM yeni yargı paketini kabul etti.", "Siyaset", 20],
  ["NASA uydu fırlatması", "NASA yeni iklim uydusunu fırlattı.", "NASA Mars gezgini yeni görüntüler gönderdi.", "Bilim", 12],
  ["Fenerbahçe transfer", "Fenerbahçe orta saha transferini tamamladı.", "Fenerbahçe basketbol takımı kupayı kazandı.", "Spor", 60],
  ["Sağlık Bakanlığı bütçe", "Sağlık Bakanlığı bütçesini açıkladı.", "Sağlık Bakanlığı grip aşısı kampanyası başlattı.", "Sağlık", 9],
  ["Almanya seçim", "Almanya'da erken seçim kararı alındı.", "Almanya koalisyon görüşmelerinde uzlaşma sağlandı.", "Dünya", 30],
  ["Kültür Bakanlığı destek", "Kültür Bakanlığı sinema desteklerini artırdı.", "Cannes'da Türk filmi ödül aldı.", "Kültür", 25],
  ["Borsa düzenlemesi", "Borsa İstanbul yeni işlem kurallarını duyurdu.", "Borsa İstanbul günü rekorla kapattı.", "Ekonomi", 3],
  ["TÜBİTAK bursu", "TÜBİTAK lisans bursu kontenjanını artırdı.", "TÜBİTAK yeni araştırma programını duyurdu.", "Bilim", 45],
  ["Apple Türkiye fiyatı", "Apple Türkiye'de ürün fiyatlarını güncelledi.", "Apple yeni çipini tanıttı.", "Teknoloji", 7],
  ["Meteoroloji kuraklık raporu", "Meteoroloji yıllık kuraklık raporunu yayımladı.", "Meteoroloji 12 il için turuncu kod verdi.", "Gündem", 50],
  ["NATO tatbikatı", "NATO Akdeniz'de tatbikat düzenledi.", "NATO zirvesinde kritik karar alındı.", "Dünya", 70],
  ["Galatasaray başkanlık", "Galatasaray başkanlık seçimini duyurdu.", "Galatasaray yeni transferini açıkladı.", "Spor", 100],
  ["Enflasyon beklentisi", "Ekonomistler yıl sonu enflasyon beklentisini paylaştı.", "Enflasyon ekimde yüzde 38,2 oldu.", "Ekonomi", 2],
  ["OpenAI davası", "OpenAI'ye karşı telif davası açıldı.", "OpenAI yeni dil modelini duyurdu.", "Yapay Zekâ", 110],
  ["AFAD eğitim programı", "AFAD deprem eğitim programını genişletti.", "AFAD sel bölgesinde çalışmaları sürdürüyor.", "Gündem", 6],
].map((row, index) => ({
  label: `N${index + 1}`,
  sameEvent: false,
  sameCluster: false,
  current: ref(`c-neg-${index}`, "haber", String(row[0]), String(row[1]), String(row[4]), BASE, `cluster-neg-a-${index}`),
  target: ref(`t-neg-${index}`, "haber", String(row[2]), String(row[3]), String(row[4]), BASE - Number(row[5]) * HOUR, `cluster-neg-b-${index}`),
}));

