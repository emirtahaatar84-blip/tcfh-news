/**
 * Haber Hattı (HQ) — TÜM sayısal kararların tek kaynağı.
 * Başka hiçbir dosyada eşik/ağırlık/saat tekrar yazılmaz.
 */

// ─── 1. Zamanlama ───────────────────────────────────────────────────────────
export const SCHEDULE = {
  morning: "08:30",
  evening: "19:00",
  watchdog: "00:15",
  timezone: "Europe/Istanbul",
} as const;

export const PORTRAIT_RUN = {
  morningQuota: 1,
  eveningQuota: 1,
  eveningQuotaIfMorningFailed: 2,
  dailyFloor: 2,
  maxFallbackTopics: 2,
  sameDayCategoryUnique: true,
  sameDaySubjectTypePenalty: 8,
  /** Kata süresinden sonra otomatik yayın açılır, kapanmaz (fail-safe). */
  shadowDays: 14,
} as const;

export const WATCHDOG = {
  lookbackHours: 24,
  minPublishedPerDay: 2,
  maxDeadSources: 0,
} as const;

// ─── 2. Portre uygunluk skoru (PUS) ─────────────────────────────────────────
export const PUS = {
  weights: {
    publicInterest: 0.25,
    subjectFocus: 0.2,
    sourceAvailability: 0.2,
    freshness: 0.15,
    originality: 0.1,
    importance: 0.1,
  },
  freshnessBands: [
    { maxDays: 2, score: 5 },
    { maxDays: 7, score: 3 },
    { maxDays: 30, score: 1 },
    { maxDays: Number.POSITIVE_INFINITY, score: 0 },
  ],
  originalityWindowDays: 7,
  thresholds: { autoPublish: 70, reviewMin: 55 },
  publicInterestScale: {
    country: 5,
    province: 4,
    sector: 3,
    company: 2,
    individual: 1,
  },
  /** distinctSubjects → KisiKurumOdakli puanı. */
  focusBands: [
    { maxSubjects: 1, score: 5 },
    { maxSubjects: 2, score: 3 },
    { maxSubjects: Number.POSITIVE_INFINITY, score: 1 },
  ],
} as const;

// ─── 3. Kategori sınıflandırma ──────────────────────────────────────────────
export const CLASSIFIER = {
  signals: {
    titleKeyword: 0.4,
    bodyKeywordDensity: 0.25,
    feedDefault: 0.15,
    entityLexicon: 0.2,
  },
  ambiguityMargin: 0.1,
  secondaryMin: 0.45,
  maxSecondary: 2,
  maxEntityTags: 3,
  maxTagsTotal: 5,
  /** Ek soyma: en uzundan kısaya. */
  suffixes: [
    "larindan", "lerinden", "larindaki", "lerindeki", "ndaki", "ndeki",
    "indaki", "indeki", "unun", "unun", "inin", "nun", "nun", "nın", "nin", "nün",
    "ligi", "lugu", "lig", "lug", "lik", "luk",
    "lari", "leri", "larin", "lerin", "lerinde", "larinda", "mini", "mizi", "nizi",
    "dan", "den", "tan", "ten", "lar", "ler", "la", "le", "da", "de",
    "ya", "ye", "ta", "te", "in", "ın", "un", "ün", "na", "ne",
    "si", "su", "gi", "gu", "ci", "cu", "ca", "ce",
  ],
  keywords: {
    Gündem: ["deprem", "sel", "yangin", "afad", "valilik", "emniyet", "resmi gazete", "operasyon", "grev", "kriz", "meteoroloji", "firtina", "kuraklik", "trafik kazasi"],
    Teknoloji: ["cip", "yazilim", "uygulama", "iphone", "android", "robot", "veri merkezi", "internet", "siber", "nanometre", "akilli telefon", "donanim", "yapay zeka urunu", "teknoloji devi", "gozluk", "giyilebilir", "cihaz", "yonga", "otomobil", "batarya", "katlanabilir", "telefon"],
    "Yapay Zekâ": ["yapay zeka", "llm", "chatgpt", "openai", "gemini", "chatbot", "makine ogrenmesi", "nvidia", "inferans", "dil modeli", "uretimsel yapay zeka"],
    Ekonomi: ["enflasyon", "faiz", "borsa", "dolar", "euro", "ihracat", "ithalat", "vergi", "butce", "asgari ucret", "merkez bankasi", "zam", "issizlik", "buyume", "ekonomi", "fiyat", "maliyet", "ihracatci", "pazar", "altin", "rezerv", "ticaret", "uretici", "sanayi", "konkordato", "ruzgar enerjisi", "yatirim"],
    Siyaset: ["meclis", "milletvekili", "secim", "parti", "bakan", "kanun teklifi", "cumhurbaskani", "tbmm", "yargi", "muhalefet", "kabine", "anayasa", "siyaset"],
    Spor: ["mac", "futbol", "basketbol", "transfer", "sampiyon", "lig", "olimpiyat", "penalti", "teknik direktor", "milli takim", "derbi", "gol", "voleybol", "final"],
    Bilim: ["arastirma", "uzay", "nasa", "tubitak", "deney", "kesif", "fizik", "kimya", "biyoloji", "mars", "gezegen", "bilim insani", "teleskop", "uydu", "yorunge", "firlatma", "kuyruklu yildiz", "yildiz"],
    "Dünya": ["abd", "ab ", "avrupa", "nato", "bm ", "rusya", "cin", "orta dogu", "disisleri", "uluslararasi", "yaptirim", "zirve", "beyaz saray", "koalisyon", "almanya"],
    Sağlık: ["saglik", "hastane", "asci", "ilac", "doktor", "viru", "salgın", "salgin", "tedavi", "bakanligi", "vaka", "pandemi", "kanser", "asi", "asi takvimi"],
    Kültür: ["film", "dizi", "sinema", "konser", "sergi", "kitap", "festival", "muze", "tiyatro", "odul", "roman", "muzik"],
  } as Record<string, string[]>,
  entityLexicon: {
    Teknoloji: ["apple", "google", "microsoft", "meta", "samsung", "tesla", "aselsan", "baykar", "tusas", "tsmc", "intel", "amd"],
    "Yapay Zekâ": ["openai", "anthropic", "deepmind", "nvidia", "hugging face", "mistral"],
    Ekonomi: ["merkez bankasi", "tcmb", "mehmet simsek", "borsa istanbul", "tuik", "akbank", "garanti bbva", "ziraat bankasi", "imf", "dunya bankasi"],
    Siyaset: ["tbmm", "cumhurbaskanligi", "akp", "chp", "mhp", "iyp", "dem partisi", "yskt", "anayasa mahkemesi"],
    "Dünya": ["nato", "birlesmis milletler", "beyaz saray", "kremlin", "avrupa birligi", "disisleri bakanligi"],
    Sağlık: ["saglik bakanligi", "dsö", "dso", "who", "tip fakultesi", "turk tabipleri birligi"],
    Spor: ["fenerbahce", "galatasaray", "besiktas", "trabzonspor", "tff", "uefa", "fiba", "tokyo"],
    Bilim: ["nasa", "tubitak", "cern", "esa", "mit", "max planck"],
    Gündem: ["afad", "meteoroloji genel mudurlugu", "emniyet genel mudurlugu", "kandilli rasathanesi"],
    Kültür: ["cannes", "venedik bienali", "berlin film festivali", "istanbul festivali"],
  } as Record<string, string[]>,
} as const;

// ─── 4. RSS işleme ──────────────────────────────────────────────────────────
export const RSS_INTAKE = {
  minWordsWithoutSpot: 300,
  maxTitleSimilarity: 0.9,
  sponsoredTerms: [
    "sponsored", "reklam", "isbirligi", "is birligi", "tanitim", "promosyon",
    "indirim kodu", "satın al", "satin al", "kampanya firsati", "advertorial",
  ],
  priceRegex: /(%\s?\d{1,2}|\d{1,3}[.,]?\d*\s?(tl|usd|eur|₺|\$))/gi,
  maxPriceDensity: 0.08,
} as const;

// ─── 5. Atıf ────────────────────────────────────────────────────────────────
export const CITATION = {
  weights: {
    entityOverlap: 0.35,
    eventSimilarity: 0.25,
    textSimilarity: 0.2,
    timeProximity: 0.1,
    categoryMatch: 0.1,
  },
  entityOverlapScores: { none: 0, one: 0.6, twoOrMore: 1 },
  eventSimilarityScores: { different: 0, continuation: 0.5, same: 1 },
  /** Olay kümesi türetme eşikleri (küme bilgisi yoksa). */
  eventDerivation: { sameTitleJaccard: 0.5, continuationTitleJaccard: 0.3 },
  timeProximityBands: [
    { maxDays: 7, score: 1.0 },
    { maxDays: 30, score: 0.6 },
    { maxDays: 90, score: 0.3 },
    { maxDays: Number.POSITIVE_INFINITY, score: 0 },
  ],
  categoryMatch: { same: 1, neighbor: 0.5, different: 0 },
  neighborCategories: [
    ["Gündem", "Dünya"],
    ["Gündem", "Siyaset"],
    ["Teknoloji", "Yapay Zekâ"],
    ["Ekonomi", "Siyaset"],
    ["Bilim", "Sağlık"],
    ["Kültür", "Spor"],
  ],
  /**
   * Kalibre edilmiş eşik. Ölçüm (tests/hq-citation.test.ts):
   *   0.80 → TP %45 (tek varlıklı parafraz çiftler 0.66+0.20×kosine takılır)
   *   0.72 → TP %95, FP %0  ← seçilen
   * 0.80'in TP'si %80 hedefinin altında kaldığı için 0.72 kullanılır.
   */
  threshold: 0.72,
  /** Otomatik denetim yanlış oranı %5'i geçerse bu değere yükseltilir. */
  thresholdEscalated: 0.78,
  candidateThreshold: 0.65,
  sensitiveThreshold: 0.9,
  maxPerContent: 3,
  maxPerTarget: 1,
  minAgeHours: 1,
  maxAnchorWords: 12,
  verifySimilarity: 0.9,
  maxParagraphs: 3,
  weeklySampleSize: 20,
  falsePositiveLimit: 0.05,
  retentionDays: 90,
} as const;

export const SENSITIVE_TERMS = {
  politics: ["catisma", "kriz", "darbe", "protesto", "boykot"],
  crime: ["suclu", "suclama", "yolsuzluk", "hirsizlik", "dolandiricilik", "gozalti", "tutuklama", "iddianame"],
  health: ["hastalik", "kanser", "virus", "salgın", "salgin", "olum", "vefat", "intihar"],
} as const;

// ─── 6. Kaynak bağımsızlığı ─────────────────────────────────────────────────
export const SOURCE_INDEPENDENCE = {
  minIndependentSources: 3,
  mediaGroups: {
    demiroren: ["hurriyet.com.tr", "hurriyetdailynews.com", "milliyet.com.tr", "cnnturk.com", "posta.com.tr"],
    dogus: ["ntv.com.tr", "ntvspor.net", "cnbce.com"],
    turkuvaz: ["sabah.com.tr", "atv.com.tr", "a-haber.com"],
    ihlas: ["ihlas.com.tr", "ihlasnews.com"],
    anadolu: ["aa.com.tr", "anadoluagency.com"],
    trt: ["trt.com", "trthaber.com", "trt.net.tr"],
    bbc: ["bbc.com", "bbc.co.uk"],
    dunya: ["dunya.com", "dunya.com.tr"],
    bloomberg: ["bloomberght.com", "bloomberg.com"],
    reuters: ["reuters.com"],
  } as Record<string, string[]>,
  referenceDomains: ["wikipedia.org", "tr.wikipedia.org"],
  /** Tek kurum = tek ses: bu alan adları her zaman 1 kaynak sayılır. */
  singleVoiceDomains: ["aa.com.tr", "trthaber.com", "trt.com", "reuters.com", "apnews.com"],
} as const;
