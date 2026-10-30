import { TURKISH_CITIES, normalizeCity } from "@/lib/geo";
import { foldTurkish } from "@/lib/utils";
import type { FeedStory } from "@/lib/kantan-feed";

/**
 * "İlgi çekici" hikâye seçimi (Ek Bölüm 9.2).
 *
 * Puanlama deterministiktir: her boyut 0-10 arası ölçülür, ağırlıklarla
 * toplanır. LLM kullanılmaz — böylece gerekçe her zaman aynı girdi için
 * aynı çıkar ve halüsinasyon riski yoktur.
 *
 * Ağırlıklar: kamu yararı %30, Türkiye yakınlığı %25, gelişme potansiyeli
 * %20, özgünlük %15, portreye uygunluk %10.
 */

export const SCORE_WEIGHTS = {
  publicInterest: 0.3,
  turkeyAffinity: 0.25,
  developmentPotential: 0.2,
  originality: 0.15,
  portraitFit: 0.1,
} as const;

export const SCORE_THRESHOLD = 7.0;

export type ScoreDimension = {
  score: number;
  weight: number;
  weighted: number;
  reason: string;
};

export type StoryScore = {
  /** 0-10, bir ondalık. */
  total: number;
  dimensions: Record<keyof typeof SCORE_WEIGHTS, ScoreDimension>;
  reason: string;
  subjectType: "kisi" | "kurum" | "olay";
  subjectName: string | null;
};

// ─── Sinyaller ───────────────────────────────────────────────────────────────

/** Kategoriye göre kamu yararı taban puanı. */
const CATEGORY_IMPACT: Record<string, number> = {
  sağlık: 8,
  saglik: 8,
  ekonomi: 8,
  savunma: 8,
  gündem: 7.5,
  gundem: 7.5,
  siyaset: 7,
  dünya: 6.5,
  dunya: 6.5,
  bilim: 6,
  teknoloji: 5.5,
  "yapay zeka": 5.5,
  "yapay zekâ": 5.5,
  yazılım: 4.5,
  yazilim: 4.5,
  spor: 5,
  kültür: 4.5,
  kultur: 4.5,
  telefon: 3.5,
  oyun: 3.5,
  podcastler: 2,
  genel: 4,
};

/** Doğrudan etki alanını gösteren ifadeler. */
const IMPACT_TERMS = [
  "milyon", "milyar", "tüm ülke", "tum ulke", "ülke geneli", "ulke geneli",
  "zam", "vergi", "kanun", "yönetmelik", "yonetmelik", "resmi gazete",
  "salgın", "salgin", "deprem", "kriz", "savaş", "savas", "ateşkes", "ateskes",
  "faiz", "enflasyon", "işsizlik", "issizlik", "asgari ücret", "asgari ucret",
  "emekli", "sağlık", "saglik", "aşı", "asi", "ilaç", "ilac",
  "savunma", "operasyon", "tatbikat", "füze", "fuze", "insansız hava",
  "yaptırım", "yaptirim", "ihracat", "ithalat", "bütçe", "butce",
];

/** Türkiye'ye yakınlık: yerel medya alan adları. */
const TR_DOMAINS = [
  "dha.com.tr", "aa.com.tr", "sozcu.com.tr", "hurriyet.com.tr",
  "milliyet.com.tr", "sabah.com.tr", "cnnturk.com", "ntv.com.tr",
  "haberturk.com", "bianet.org", "bbc.com/turkce", "tr.euronews.com",
  "ekonomim.com", "dunya.com", "bigpara.hurriyet.com.tr", "teknoloji.org",
  "webtekno.com", "shiftdelete.net", "donanimhaber.com", "notebookcheck-tr.com",
  "patronlardunyasi.com", "paraanaliz.com", "medyascope.tv", "gazeteduvar.com.tr",
  "t24.com.tr", "kronos35.news", "trthaber.com", "star.com.tr",
];

/** Türkiye kurumları ve aktörleri. */
const TR_ENTITIES = [
  "ssb", "savunma sanayii başkanlığı", "savunma sanayii baskanligi",
  "tsk", "türk silahlı kuvvetleri", "turk silahli kuvvetleri",
  "mke", "aselsan", "roketsan", "tusaş", "tusas", "baykar", "tübitak", "tubitak",
  "tüik", "tuik", "merkez bankası", "merkez bankasi", "tcmb", "bddk", "spk",
  "cumhurbaşkanlığı", "cumhurbaskanligi", "bakanlığı", "bakanligi",
  "belediyesi", "valiliği", "valiligi", "tbmm", "rektörlüğü", "rektorlugu",
  "üniversitesi", "universitesi", "emniyet", "sahil güvenlik", "sahil guvenlik",
  "haluk görgün", "haluk gorgun", "mehmet şimşek", "mehmet simsek",
];

/** Gelişme potansiyeli (devam eden, takip edilebilir olay). */
const DEVELOPMENT_TERMS = [
  "sürüyor", "suruyor", "devam ediyor", "başladı", "basladi", "başlayacak",
  "baslayacak", "açıklama", "aciklama", "açıkladı", "acikladi", "duyurdu",
  "soruşturma", "sorusturma", "iddia", "iddiaları", "iddialari", "kriz",
  "hazırlık", "hazirlik", "görüşme", "gorusme", "toplantı", "toplanti",
  "süreç", "surec", "plan", "hedef", "bekleniyor", "beklenti", "ilk kez",
  "rekor", "karar", "onay", "ret", "itiraz", "talep", "uyarı", "uyari",
  "2026", "2027", "önümüzdeki", "onumuzdeki", "gelecek ay", "gelecek hafta",
];

/** Kişi/unvan kalıpları (portre odağı). */
const PERSON_TITLE_TERMS = [
  "başkanı", "baskani", "başkan", "baskan", "bakanı", "bakani", "bakan",
  "genel müdür", "genel mudur", "ceo", "cto", "cfo", "prof.", "profesör",
  "profesor", "dr.", "doç.", "doc.", "sözcü", "sozcu", "müdür", "mudur",
  "rektör", "rektor", "komutan", "vali", "kaymakam", "ceza", "savcı", "savci",
  "kurucu", "yönetici", "yonetici", "milletvekili", "vekil", "lideri",
  "başkanvekili", "baskanvekili", "sahibi", "direktör", "direktor",
];

/** Kurum kalıpları. */
const ORG_TERMS = [
  "bakanlığı", "bakanligi", "kurumu", "kurulu", "başkanlığı", "baskanligi",
  "şirketi", "sirketi", "holding", "bankası", "bankasi", "üniversitesi",
  "universitesi", "ajansı", "ajansi", "vakfı", "vakfi", "derneği", "dernegi",
  "belediyesi", "komisyonu", "meclisi", "mahkemesi", "enstitüsü", "enstitusu",
  "ajans", "laboratuvar", "kuruluşu", "kurulusu", "federasyonu", "sendikası",
];

const STOP_WORDS = new Set([
  "bir", "bu", "şu", "su", "ile", "ve", "veya", "ama", "fakat", "için", "icin",
  "olan", "olarak", "daha", "çok", "cok", "en", "son", "yeni", "göre", "gore",
  "kadar", "gibi", "sonra", "önce", "once", "üzerine", "uzerine", "hakkında",
  "hakkinda", "türkiye", "turkiye", "türk", "turk", "türkiye'de", "yıl", "yil",
  "gün", "gun", "ay", "hafta", "gündem", "gundem", "haber", "haberler",
]);

// ─── Metin yardımcıları ─────────────────────────────────────────────────────

function fold(value: string): string {
  return foldTurkish(value.toLocaleLowerCase("tr-TR"));
}

function countTerms(haystack: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(fold(term))) hits += 1;
  }
  return hits;
}

function tokenSet(text: string): Set<string> {
  const folded = fold(text).replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = folded
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  return intersection / (a.size + b.size - intersection);
}

function clamp(value: number, min = 0, max = 10): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Başlıkta geçen ilk il (yerel bağ sinyali). */
function detectCityInStory(story: FeedStory): string | null {
  const haystack = `${story.title} ${story.summary}`;

  // normalizeCity tam eşleşme ister; burada ekli biçimleri de yakalamak
  // için il adlarını kelime başıyla arıyoruz.
  for (const city of TURKISH_CITIES) {
    const pattern = new RegExp(
      `(^|[^\\p{L}])${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "u",
    );
    if (pattern.test(haystack)) return normalizeCity(city) ?? city;
  }

  return null;
}

// ─── Boyut hesapları ────────────────────────────────────────────────────────

function scorePublicInterest(story: FeedStory, haystack: string): {
  score: number;
  reason: string;
} {
  const categoryKey = fold(story.category);

  let base = CATEGORY_IMPACT[categoryKey] ?? 4;
  const impactHits = countTerms(haystack, IMPACT_TERMS);
  const tagBoost = Math.min(story.tags.length, 6) * 0.15;

  // Görüntülenme (kantan toplu sayaç) — yüksek ilginin göstergesi.
  base += Math.min(impactHits, 6) * 0.45 + tagBoost;

  const reasons: string[] = [];
  if (categoryKey) reasons.push(`kategori “${story.category}”`);
  if (impactHits > 0) reasons.push(`${impactHits} etki ifadesi`);

  return {
    score: clamp(round1(base)),
    reason: reasons.length > 0 ? reasons.join(", ") : "belirgin etki sinyali yok",
  };
}

function scoreTurkeyAffinity(story: FeedStory, haystack: string): {
  score: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  const domain = fold(story.originalUrl ?? story.url);
  const trDomain = TR_DOMAINS.find((item) => domain.includes(fold(item)));
  if (trDomain) {
    score += 4.5;
    reasons.push(`yerel kaynak (${trDomain})`);
  }

  if (/\.com\.tr(\/|$)/.test(domain)) {
    score += 1.5;
    reasons.push("tr uzantılı kaynak");
  }

  const entityHits = countTerms(haystack, TR_ENTITIES);
  if (entityHits > 0) {
    score += Math.min(entityHits, 4) * 1.2;
    reasons.push(`${entityHits} Türkiye kurumu/aktörü`);
  }

  const city = detectCityInStory(story);
  if (city) {
    score += 2;
    reasons.push(`yerel bağ (${city})`);
  }

  // Türkçe içerik oranı (diyakritik + yaygın Türkçe ekler).
  const turkishChars = (story.title.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length;
  if (turkishChars >= 3) {
    score += 1.5;
    reasons.push("Türkçe içerik");
  }

  return {
    score: clamp(round1(score)),
    reason: reasons.length > 0 ? reasons.join(", ") : "Türkiye bağı zayıf",
  };
}

function scoreDevelopmentPotential(haystack: string): {
  score: number;
  reason: string;
} {
  const hits = countTerms(haystack, DEVELOPMENT_TERMS);
  const score = clamp(3 + Math.min(hits, 7) * 1);

  return {
    score: round1(score),
    reason:
      hits > 0
        ? `${hits} gelişme sinyali (devam eden/takip edilebilir)`
        : "kapalı uçlu, tek seferlik olay",
  };
}

function scoreOriginality(
  story: FeedStory,
  allTokens: Map<string, Set<string>>,
): { score: number; reason: string } {
  const own = allTokens.get(story.key) ?? new Set<string>();
  let maxSimilarity = 0;

  for (const [key, tokens] of allTokens) {
    if (key === story.key) continue;
    const similarity = jaccard(own, tokens);
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  }

  // Aynı konuda çok haber → özgünlük düşük.
  const score = clamp(10 - maxSimilarity * 14);

  return {
    score: round1(score),
    reason:
      maxSimilarity >= 0.2
        ? `aynı konuda benzer hikâye var (benzerlik %${Math.round(maxSimilarity * 100)})`
        : "akışta benzersiz konu",
  };
}

type SubjectGuess = {
  type: "kisi" | "kurum" | "olay";
  name: string | null;
  score: number;
  reason: string;
};

const ORG_SUFFIX_PATTERN =
  /([A-ZÇĞİÖŞÜ][\p{L}0-9'’.&-]*(?:(?:\s+(?:ve|ile|veya)\s+|[\s]+)[A-ZÇĞİÖŞÜ][\p{L}0-9'’.&-]*){0,5})\s+(Bakanlığı|Bakanligi|Kurumu|Kurulu|Başkanlığı|Baskanligi|Şirketi|Sirketi|Bankası|Bankasi|Üniversitesi|Universitesi|Ajansı|Ajansi|Vakfı|Vakfi|Derneği|Dernegi|Belediyesi|Komisyonu|Enstitüsü|Enstitusu|Federasyonu|Sendikası|Sendikasi)/u;

/**
 * Kişi adı: iki ardışık "Başlık biçimli" sözcük (Haluk Görgün).
 * TÜMÜ BÜYÜK (SİPER) veya sayı içeren (Ürün-2) ürün/kurum adları elenir.
 */
const PERSON_PATTERN =
  /([A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,19})\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,19})/gu;

/** Kişi adı sanılmaması gereken kalıplar. */
const NAME_BLOCKLIST = new Set(
  [
    "ana sayfa", "son dakika", "yapay zeka", "yapay zekâ", "resmi gazete",
    "kaynak kod", "açık kaynak", "acik kaynak", "birleşik krallık",
    "birlesik krallik", "avrupa birliği", "avrupa birligi", "amerika birleşik",
    "sağlık bakanlığı", "saglik bakanligi", "milli eğitim", "milli egitim",
    "kuzey kore", "güney kore", "guney kore", "suudi arabistan",
    "ilk kez", "son kez", "yeni bir", "büyük bir", "buyuk bir", "son bir",
    "geçen hafta", "gecen hafta", "bu yıl", "bu yil", "öne çıkan", "one cikan",
    "dikkat çeken", "dikkat ceken", "tam isabet", "rekor kırdı", "rekor kirdi",
  ].map((item) => item),
);

/**
 * Unvan sözcüğüne (Başkanı, Bakan, CEO…) en yakın kişi adını bulur.
 * "SİPER Ürün-2" gibi ürün adlarını kişi sanmamak için yalnızca unvan
 * yakınındaki (±90 karakter) adlar kabul edilir.
 */
/** Kurum sözcükleri: bu sözcükleri içeren ikililer kişi adı sayılmaz. */
const ORG_WORD_BLOCKLIST = new Set([
  "sanayii", "sanayi", "bakanlık", "bakanlığı", "bakanligi", "kurumu",
  "başkanlığı", "baskanligi", "başkanlık", "baskanlik", "üniversitesi",
  "universitesi", "üniversite", "universite", "belediyesi", "meclisi",
  "mahkemesi", "komisyonu", "müdürlüğü", "mudurlugu", "ajansı", "ajansi",
  "holding", "şirketi", "sirketi", "bankası", "bankasi", "enstitüsü",
  "enstitusu", "vakfı", "vakfi", "derneği", "dernegi", "federasyonu",
  "sendikası", "sendikasi", "konseyi", "kurulu", "genel", "merkez",
  "komutanlığı", "komutanligi", "müdürlüğü", "mudurlugu", "müdürlük",
  "gücü", "gucu", "kuruluşu", "kurulusu", "idaresi", "işletmesi", "isletmesi",
]);

function isTitleWord(word: string): boolean {
  const folded = fold(word);
  return PERSON_TITLE_TERMS.some((term) => fold(term) === folded);
}

/**
 * Unvana (Başkanı, Bakan, CEO…) komşu kişi adını bulur.
 *
 * Yaklaşım: metni sözcüklere ayır, ardışık iki "Başlık biçimli" sözcükten
 * oluşan ikilileri değerlendir. Unvan ve kurum sözcükleri elenir; unvandan
 * hemen SONRA gelen ikili en yüksek önceliği alır (Türkçe kalıbı:
 * "Savunma Sanayii Başkanı Haluk Görgün").
 */
function findPersonNearTitles(text: string): string | null {
  const wordPattern = /[A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,19}/g;
  const words = [...text.matchAll(wordPattern)].map((match) => ({
    text: match[0],
    index: match.index ?? 0,
  }));

  const folded = fold(text);
  const titleIndices: number[] = [];

  for (const term of PERSON_TITLE_TERMS) {
    const needle = fold(term);
    let index = folded.indexOf(needle);

    while (index !== -1) {
      titleIndices.push(index);
      index = folded.indexOf(needle, index + 1);
    }
  }

  if (titleIndices.length === 0) return null;

  type Candidate = { name: string; priority: number; distance: number };
  let best: Candidate | null = null;

  for (let i = 0; i < words.length - 1; i += 1) {
    const first = words[i];
    const second = words[i + 1];

    // İki sözcük arasında yalnızca boşluk olmalı.
    const between = text.slice(first.index + first.text.length, second.index);
    if (!/^\s+$/.test(between)) continue;

    if (isTitleWord(first.text) || isTitleWord(second.text)) continue;

    const name = `${first.text} ${second.text}`;
    const foldedName = fold(name);

    if (NAME_BLOCKLIST.has(foldedName)) continue;

    const nameWords = [fold(first.text), fold(second.text)];
    if (nameWords.some((word) => ORG_WORD_BLOCKLIST.has(word))) continue;
    if (ORG_TERMS.some((term) => foldedName.includes(fold(term)))) continue;

    const previous = words[i - 1];
    const nextNext = words[i + 2];

    // Yalnızca unvana BİTİŞİK ikililer kabul edilir:
    //   "… Başkanı Haluk Görgün" (0) veya "Haluk Görgün açıklamasında" (1)
    let priority = -1;
    if (previous && isTitleWord(previous.text)) priority = 0;
    else if (nextNext && isTitleWord(nextNext.text)) priority = 1;

    if (priority === -1) continue;

    const distance = Math.min(
      ...titleIndices.map((index) => Math.abs(index - first.index)),
    );

    if (
      !best ||
      priority < best.priority ||
      (priority === best.priority && distance < best.distance)
    ) {
      best = { name, priority, distance };
    }
  }

  return best?.name ?? null;
}

/**
 * Cümle içinde geçen ama kurum adına ait OLMAYAN kelimeler: çekimli fiiller
 * ve sıfatlar. Kurum adı çıkarımında önek olarak kullanılmazlar.
 */
const SENTENCE_WORDS = new Set([
  // Çekimli fiiller / ortaçlar (fold edilmiş)
  "tamamlandi", "aciklandi", "basladi", "yapildi", "edildi", "duyuruldu",
  "imzalandi", "onaylandi", "gecti", "toplandi", "artti", "dustu", "geriledi",
  "yukseldi", "kabul", "ilgili", "yeni", "bu", "ve", "ile", "veya",
  // Bu kelimelerle BİTEN çekimli fiilleri de yakala
]);

/** Fiil/ortaç sonu kalıbı: Tamamlandı, Açıklandı, Başladı, Yapıldı, Edildi… */
const VERB_ENDINGS = /(mlandi|nlandi|ildi|uldu|ldu|ldi|landi|landı|di|dı|ti|tı)$/u;

/** Özel ad: büyük harfle başlar (Türkçe cümle başı olmayan bağlamda). */
function isSpecialName(word: string): boolean {
  const first = Array.from(word)[0];
  if (!first) return false;
  return first === first.toLocaleUpperCase("tr-TR") && first !== first.toLocaleLowerCase("tr-TR") && !isSentenceWord(word);
}

function isSentenceWord(word: string): boolean {
  const folded = fold(word);
  if (SENTENCE_WORDS.has(folded)) return true;
  // Uzun kelimelerde çekimli fiil ekini de ara ("Tamamlandı" → "tamamlandi").
  return folded.length >= 6 && VERB_ENDINGS.test(folded);
}

function detectSubject(story: FeedStory, haystackRaw: string): SubjectGuess {
  const orgMatch = haystackRaw.match(ORG_SUFFIX_PATTERN);
  const orgPrefixWords = orgMatch ? orgMatch[1].trim().split(/\s+/) : [];

  // Kurum adı: başlıktaki tam öbeği kullan, ama son kelimenin fiil/sıfat
  // (Tamamlandı, Açıklandı, Başladı…) olmasını engelle. Önceki kod koşulsuz
  // son 2 kelimeyi aldığı için "Tamamlandı Ticaret Bakanlığı" üretiyordu.
  // Önekten yalnızca "gerçek kurum adı" kalana kadar SAĞDAN kırp:
  //   "… Uyum Tamamlandı Ticaret Bakanlığı" → "Ticaret Bakanlığı"
  //   "Sanayi ve Teknoloji Bakanlığı"        → "Sanayi ve Teknoloji Bakanlığı"
  // Kural: özel ad kelimeleri büyük harfle başlar. Orijinal metinde büyük
  // harfle başlamayan ilk kelimeye rastlayınca dur (cümle içi kelimeler:
  // "ile", "Uyum" bağlama göre değişir; bu yüzden büyük/küçük harf + bağlaç
  // sözlüğü birlikte kullanılır).
  const trimmedPrefix = (() => {
    const words = [...orgPrefixWords].filter((word) => word.length > 0);

    // Özel ad dizisini SAĞDAN büyüt: "Mevzuatında Uyum Tamamlandı Ticaret"
    // → sağdan "Ticaret" özel adı, "Tamamlandı" fiil → dur.
    const picked: string[] = [];
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i];
      const isConnector = ["ile", "ve", "veya", "de", "da"].includes(fold(word));
      if (!isSpecialName(word) && !(isConnector && picked.length > 0)) break;
      picked.unshift(word);
      if (picked.length >= 6) break;
    }

    return picked.length > 0 ? picked : words.slice(-2);
  })();

  const orgName =
    orgMatch && trimmedPrefix.length > 0
      ? `${trimmedPrefix.join(" ")} ${orgMatch[2]}`.trim()
      : null;
  const foldedHaystack = fold(haystackRaw);

  // 1) Unvana BİTİŞİK kişi adı — portre için en güçlü anlatı odağı
  const personNearTitle = findPersonNearTitles(haystackRaw);

  if (personNearTitle) {
    return {
      type: "kisi",
      name: personNearTitle,
      score: 9,
      reason: `kişi odaklı, unvanlı anlatım (${personNearTitle})`,
    };
  }

  // 2) Kurum ekiyle biten yapı (… Bakanlığı / … Başkanlığı)
  if (orgName) {
    return {
      type: "kurum",
      name: orgName,
      score: 8.5,
      reason: `kurum odaklı (${orgName})`,
    };
  }

  // 3) Kurum bağlamı (eki olmayan kurum adları)
  const orgHit = ORG_TERMS.find((term) => foldedHaystack.includes(fold(term)));

  if (orgHit) {
    return {
      type: "kurum",
      name: orgName,
      score: 7.5,
      reason: `kurum bağlamı (${orgHit})`,
    };
  }

  // 4) Tek olay etrafında odaklanmış anlatım
  const tokens = tokenSet(story.title);
  const focus = tokens.size >= 4 && tokens.size <= 12 ? 6 : 4.5;

  return {
    type: "olay",
    name: null,
    score: focus,
    reason:
      focus >= 6
        ? "tek olay etrafında odaklanmış anlatım"
        : "dağınık/çok konulu başlık",
  };
}

// ─── Ana API ────────────────────────────────────────────────────────────────

/**
 * Bir parti hikâyeyi puanlar. Özgünlük boyutu partiye bağlı olduğu için
 * tüm hikâyeler birlikte değerlendirilir.
 */
export function scoreStories(stories: FeedStory[]): Map<string, StoryScore> {
  const results = new Map<string, StoryScore>();

  const tokenMap = new Map<string, Set<string>>();
  for (const story of stories) {
    tokenMap.set(story.key, tokenSet(`${story.title} ${story.summary}`));
  }

  for (const story of stories) {
    const haystackRaw = `${story.title} ${story.summary} ${story.category} ${story.tags.join(" ")}`;
    const haystack = fold(haystackRaw);

    const publicInterest = scorePublicInterest(story, haystack);
    const turkeyAffinity = scoreTurkeyAffinity(story, haystack);
    const development = scoreDevelopmentPotential(haystack);
    const originality = scoreOriginality(story, tokenMap);
    const subject = detectSubject(story, haystackRaw);

    const dimensions = {
      publicInterest: {
        score: publicInterest.score,
        weight: SCORE_WEIGHTS.publicInterest,
        weighted: round1(publicInterest.score * SCORE_WEIGHTS.publicInterest),
        reason: publicInterest.reason,
      },
      turkeyAffinity: {
        score: turkeyAffinity.score,
        weight: SCORE_WEIGHTS.turkeyAffinity,
        weighted: round1(turkeyAffinity.score * SCORE_WEIGHTS.turkeyAffinity),
        reason: turkeyAffinity.reason,
      },
      developmentPotential: {
        score: development.score,
        weight: SCORE_WEIGHTS.developmentPotential,
        weighted: round1(development.score * SCORE_WEIGHTS.developmentPotential),
        reason: development.reason,
      },
      originality: {
        score: originality.score,
        weight: SCORE_WEIGHTS.originality,
        weighted: round1(originality.score * SCORE_WEIGHTS.originality),
        reason: originality.reason,
      },
      portraitFit: {
        score: subject.score,
        weight: SCORE_WEIGHTS.portraitFit,
        weighted: round1(subject.score * SCORE_WEIGHTS.portraitFit),
        reason: subject.reason,
      },
    };

    const total = round1(
      Object.values(dimensions).reduce((sum, item) => sum + item.weighted, 0),
    );

    results.set(story.key, {
      total,
      dimensions,
      reason: `Kamu yararı ${dimensions.publicInterest.score}/10 · Türkiye bağı ${dimensions.turkeyAffinity.score}/10 · Gelişme ${dimensions.developmentPotential.score}/10 · Özgünlük ${dimensions.originality.score}/10 · Portre uyumu ${dimensions.portraitFit.score}/10. ${subject.reason}.`,
      subjectType: subject.type,
      subjectName: subject.name,
    });
  }

  return results;
}

/**
 * Aynı konuda 7 gün içinde portre üretilmiş mi? (9.2 kuralı)
 * Konu adı + kategori + başlık benzerliği ile kontrol edilir.
 */
export function isRecentlyCovered(
  candidate: { title: string; subjectName: string | null; category: string | null },
  existing: { title: string; subjectName: string | null; category: string }[],
): { covered: boolean; reason: string } {
  const candidateTokens = tokenSet(candidate.title);
  const candidateSubject = candidate.subjectName ? fold(candidate.subjectName) : null;

  for (const portrait of existing) {
    if (
      candidateSubject &&
      portrait.subjectName &&
      fold(portrait.subjectName) === candidateSubject
    ) {
      return {
        covered: true,
        reason: `aynı konu (${portrait.subjectName}) son 7 günde işlendi`,
      };
    }

    const similarity = jaccard(candidateTokens, tokenSet(portrait.title));

    if (similarity >= 0.35) {
      return {
        covered: true,
        reason: `benzer başlık son 7 günde portrelendi (%${Math.round(similarity * 100)} benzerlik)`,
      };
    }
  }

  return { covered: false, reason: "" };
}
