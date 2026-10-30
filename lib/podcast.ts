import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isAdminAuthorized } from "@/lib/auth";
import { resolveSpeechEndpoint, resolveTtsModel, sanitizeTtsText } from "@/lib/speech";
import { isCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  extractJsonObject,
  getErrorMessage,
  resolveChatCompletionsUrl,
  truncate,
} from "@/lib/utils";
import {
  assignVoiceKey,
  assignVoiceKeys,
  getPodcastVoice,
  PODCAST_VOICE_KEYS,
  type PodcastVoiceKey,
} from "@/lib/podcast-voices";

/**
 * Potkes (YZ Podcast Stüdyosu) çekirdeği: owner konu/mod seçer → sistem
 * sitedeki GERÇEK haberlerden YZ ile iki+ kişilik konuşma senaryosu yazar →
 * owner taslağı düzenler (YZ destekli tek tur yeniden yazımı dahil) → ses
 * üretilir (her karakterin sabit voiceKey'i) → owner DİNLEMEDEN
 * (playedAt kilidi) yayımlayamaz → yayınlanınca herkese açık podcast.
 *
 * Desenler video-news.ts ve x-studio.ts ile aynı: settings'ten LLM
 * yapılandırması, `chat_template_kwargs: { enable_thinking: false }`
 * (modelin thinking modunda askıda kalmasını önlemek için ZORUNLU), zod
 * doğrulama, bellek içi iş takibi (in-flight koruması) ve DB durum takibi.
 *
 * Durum makinesi:
 *   processing       → draft          (LLM senaryo başarılı)
 *   processing       → failed         (haber yok / LLM hatası)
 *   draft            → audio_processing (generateAudio)
 *   audio_processing → ready          (tüm TTS parçaları birleşti)
 *   audio_processing → failed         (TTS hatası)
 *   draft            → draft          (senaryo düzenlemesi — ses geçersizleşir)
 *   ready            → published      (owner dinlediyse; publish uç noktası)
 */

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** Yaklaşık TTS hızı: saniye başına karakter (süre tahmini için). */
const CHARS_PER_SECOND = 14;

const LLM_TIMEOUT_MS = 120_000;

/**
 * Tüm senaryo TEK istekte sentezlenir (parçalı istekler ses karakterini
 * akış boyunca bozuyordu). Uzun metin üretimi dakikalar sürebildiği için
 * zaman aşımı geniş tutulur.
 */
const TTS_TIMEOUT_MS = 900_000;

const MODE_LABELS: Record<string, string> = {
  hourly: "Saatlik bülten (son 1 saat)",
  daily: "Günlük özet (son 24 saat)",
  weekly: "Haftalık özet (son 7 gün)",
  custom: "Özel konu",
};

// ─── Zod şemaları (endpoint'lerle paylaşılır) ────────────────────────────────

export type PodcastSpeaker = { name: string; role: string; voiceKey: string };

export type PodcastTurn = { speaker: string; text: string };

export type PodcastScript = {
  speakers: PodcastSpeaker[];
  turns: PodcastTurn[];
};

/** POST /api/podcast gövdesi. */
export const podcastSubmitSchema = z
  .object({
    mode: z.enum(["daily", "weekly", "custom"]),
    category: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        return trimmed.length > 0 ? trimmed : null;
      })
      .refine((value) => value === null || isCategory(value), {
        message: "Geçersiz kategori.",
      }),
    topic: z.string().trim().max(500, "Konu en fazla 500 karakter olabilir.").optional(),
    newsIds: z
      .array(z.string().regex(/^[a-zA-Z0-9]{5,40}$/, "Geçersiz haber kimliği."))
      .max(8, "En fazla 8 haber seçilebilir.")
      .optional(),
  })
  .refine(
    (data) =>
      data.mode !== "custom" ||
      Boolean(data.topic && data.topic.length > 0) ||
      (data.newsIds && data.newsIds.length > 0),
    {
      message:
        "Custom modda konu (topic) ya da en az bir haber (newsIds) gereklidir.",
      path: ["topic"],
    },
  );

export type PodcastSubmitInput = z.infer<typeof podcastSubmitSchema>;

/**
 * PUT /api/podcast/:id/script gövdesi — turns değişir; speakers sabittir
 * ama voiceKey'leri (karakter sesleri) speakerVoices ile güncellenebilir.
 */
export const podcastScriptUpdateSchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z.string().trim().min(1, "Konuşmacı adı gerekli.").max(60),
        text: z
          .string()
          .trim()
          .min(1, "Tur metni boş olamaz.")
          .max(6000, "Bölüm metni en fazla 6000 karakter olabilir."),
      }),
    )
    .min(1, "En az bir tur gerekli.")
    .max(40, "En fazla 40 tur olabilir."),
  /** Konuşmacı adı → voiceKey (karakter sesi) güncellemeleri. */
  speakerVoices: z
    .record(
      z.string().trim().min(1).max(60),
      z.enum(PODCAST_VOICE_KEYS as [PodcastVoiceKey, ...PodcastVoiceKey[]]),
    )
    .optional(),
});

/** DB'deki script JSON'undan okunan yapı (voiceKey dahil). */
const storedScriptSchema = z.object({
  speakers: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string(),
        voiceKey: z.string(),
      }),
    )
    .min(1),
  turns: z
    .array(z.object({ speaker: z.string().min(1), text: z.string().min(1) }))
    .min(1),
});

// ─── LLM çıktı şemaları ──────────────────────────────────────────────────────

/**
 * LLM'den beklenen senaryo çıktısı (voiceKey henüz YOK — sonra atanır).
 * Toplam metin 6000 karakterle sınırlıdır: editörün tek yazma alanı ve
 * PUT /script şemasıyla AYNI üst sınır (podcastScriptUpdateSchema).
 */
const llmScriptSchema = z
  .object({
    title: z.string().trim().min(1, "Başlık boş olamaz.").max(90, "Başlık en fazla 90 karakter olabilir."),
    speakers: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          role: z.string().trim().min(1).max(200),
        }),
      )
      .length(1, "Senaryo tek konuşmacılı olmalı (Sunucu)."),
    turns: z
      .array(
        z.object({
          speaker: z.string().trim().min(1).max(60),
          text: z.string().trim().min(1).max(600, "Tur metni çok uzun."),
        }),
      )
      .min(5, "En az 5 tur gerekli.")
      .max(16, "En fazla 16 tur."),
  })
  .refine(
    (data) => data.turns.every((turn) => data.speakers.some((s) => s.name === turn.speaker)),
    { message: "Her turun konuşmacısı speakers listesindeki bir isimle eşleşmeli.", path: ["turns"] },
  )
  .refine(
    (data) =>
      data.turns.reduce((total, turn) => total + turn.text.length, 0) <= 6000,
    { message: "Senaryo toplamı en fazla 6000 karakter olabilir.", path: ["turns"] },
  );

type LlmScript = z.infer<typeof llmScriptSchema>;

// ─── Kayıt tipi (Prisma satır şekli; client yeniden üretilene kadar soyut) ────

export type PodcastEpisodeRecord = {
  id: string;
  title: string | null;
  mode: string;
  category: string | null;
  topic: string | null;
  newsIds: string | null;
  guests: string | null;
  script: string | null;
  status: string;
  audio: Uint8Array | null;
  audioDurationSec: number | null;
  playedAt: Date | null;
  publishedAt: Date | null;
  isAuto: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Hata türleri (uç noktalar HTTP durum koduna çevirir) ─────────────────────

export type PodcastErrorCode =
  | "NOT_FOUND"
  | "NOT_PLAYED"
  | "NOT_READY"
  | "INVALID_STATE"
  | "INVALID_SCRIPT"
  | "ALREADY_PUBLISHED";

export const PODCAST_ERROR_STATUS: Record<PodcastErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_PLAYED: 403,
  NOT_READY: 409,
  INVALID_STATE: 409,
  INVALID_SCRIPT: 400,
  ALREADY_PUBLISHED: 409,
};

export class PodcastError extends Error {
  readonly code: PodcastErrorCode;

  constructor(code: PodcastErrorCode, message: string) {
    super(message);
    this.name = "PodcastError";
    this.code = code;
  }
}

// ─── Ortak yardımcılar ───────────────────────────────────────────────────────

const globalForPodcast = globalThis as unknown as {
  podcastScriptInFlight?: Set<string>;
  podcastAudioInFlight?: Set<string>;
};

function scriptInFlight(): Set<string> {
  if (!globalForPodcast.podcastScriptInFlight) {
    globalForPodcast.podcastScriptInFlight = new Set<string>();
  }
  return globalForPodcast.podcastScriptInFlight;
}

function audioInFlight(): Set<string> {
  if (!globalForPodcast.podcastAudioInFlight) {
    globalForPodcast.podcastAudioInFlight = new Set<string>();
  }
  return globalForPodcast.podcastAudioInFlight;
}

function auditLog(action: string, meta: object): void {
  console.log(
    JSON.stringify({
      channel: "audit",
      action,
      at: new Date().toISOString(),
      ...meta,
    }),
  );
}

/** Yönetim paneli erişim kontrolü: sahip oturumu veya Basic Auth yedeği. */
export async function isPodcastAuthorized(request: Request): Promise<boolean> {
  return isAdminAuthorized(request);
}

export function parsePodcastScript(
  raw: string | null | undefined,
): PodcastScript | null {
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = storedScriptSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

// ─── LLM çağrısı (x-studio.ts / video-news.ts deseni) ────────────────────────

async function callLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  const settings = await getSettings();

  if (!settings.apiKey.trim() || !settings.providerUrl.trim()) {
    throw new Error("LLM sağlayıcısı yapılandırılmamış.");
  }

  const response = await fetch(resolveChatCompletionsUrl(settings.providerUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // Model thinking modunda kısıtlı promptlarda dakikalarca reasoning
      // yapıp zaman aşımına düşüyor — kapatmak ZORUNLU.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 200);
    throw new Error(`LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const raw = payload.choices?.[0]?.message?.content;

  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("LLM yanıtı boş döndü.");
  }

  return raw;
}

function parseLlmJson<S extends z.ZodType>(
  raw: string,
  schema: S,
  context: string,
): z.output<S> {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error(`LLM yanıtı geçerli JSON değildi (${context}).`);
  }

  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `LLM çıktısı doğrulanamadı (${context}): ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(kök)"}: ${issue.message}`)
        .join("; ")
        .slice(0, 300)}`,
    );
  }

  return parsed.data;
}

// ─── Senaryo üretimi (LLM) ───────────────────────────────────────────────────

const SCRIPT_SYSTEM_PROMPT = `Sen deneyimli bir Türkçe haber bülteni yazarısın. Verilen GERÇEK haber materyalinden TEK KİŞİLİK (monolog) bir bülten senaryosu yazacaksın.

KURALLAR:
1. TEK konuşmacı: "Sunucu". speakers dizisi YALNIZCA bir kişi içermeli: {"name": "Sunucu", "role": "deneyimli haber bülteni sunucusu"}. Tüm turlar Sunucu tarafından okunur — diyalog, sohbet, ikinci kişi YOK.
2. SADECE verilen haber materyalindeki bilgilerden bahset. Hiçbir haber, isim, sayı, tarih, olay UYDURMA. Materyalde olmayan bilgi yok.
3. Akıcı bülten dili kullan: kısa-orta cümleler, haberler arasında doğal geçişler ("Şimdi başka bir gelişmeye geçelim...", "Öte yandan...", "Son olarak...").
4. 8-16 tur (turns). Her tur 2-5 cümle — bültenin bir paragrafı.
5. Mutlaka kısa bir açılış (selamlama, bülten tanıtımı) ve bir kapanış (kısa özet, veda) olsun.
6. turns[].speaker değeri DAİMA "Sunucu" olmalı.
7. Toplam senaryo metni 6000 karakteri ASLA aşmasın.

Yanıt: SADECE geçerli JSON, markdown çiti olmadan:
{"title": "bölüm başlığı (en fazla 90 karakter)", "speakers": [{"name": "Sunucu", "role": "deneyimli haber bülteni sunucusu"}], "turns": [{"speaker": "Sunucu", "text": "..."}]}`;

/**
 * Saatlik otomatik bülten istemi — radyo akışı: kısa, tempolu, her haber
 * 1-2 cümle; dinleyici bir sonraki bülteni beklemeli hissi.
 */
const HOURLY_SYSTEM_PROMPT = `Sen bir radyo haber spikerisin. Verilen GERÇEK haber materyalinden SAATLİK radyo bülteni yazacaksın.

KURALLAR:
1. TEK konuşmacı: "Sunucu" (sen). speakers dizisi YALNIZCA: {"name": "Sunucu", "role": "radyo haber spikeri"}.
2. SADECE verilen materyalden bahset — hiçbir şey uydurma.
3. RADYO ÜSLUBU: kısa ve tempolu. Her haber 1-2 cümle. "Radyo kanallarınızda saat HABER SAATİ bülteni" gibi doğal radyo dili kullan.
4. 5-10 tur. Açılışta bülteni tanıt ("Saat ... itibarıyla öne çıkan gelişmeler..."), kapanışta kısa veda + "bir sonraki bültenimize kadar" de.
5. turns[].speaker değeri DAİMA "Sunucu".
6. Toplam metin 2500 karakteri aşmasın.

Yanıt: SADECE geçerli JSON, markdown çiti olmadan:
{"title": "kısa bülten başlığı (en fazla 90 karakter)", "speakers": [{"name": "Sunucu", "role": "radyo haber spikeri"}], "turns": [{"speaker": "Sunucu", "text": "..."}]}`;

/**
 * Gün sonu detaylı özet istemi — 24 saatin TÜM haberlerini kapsayan,
 * her haberi ayrıntılı işleyen uzun bülten.
 */
const DAY_END_SYSTEM_PROMPT = `Sen deneyimli bir Türkçe haber bülteni yazarısın. Son 24 saatin TÜM haberlerinden GÜN SONU ÖZET bülteni yazacaksın.

KURALLAR:
1. TEK konuşmacı: "Sunucu". speakers dizisi YALNIZCA: {"name": "Sunucu", "role": "deneyimli haber bülteni sunucusu"}.
2. SADECE verilen haber materyalindeki bilgilerden bahset. Hiçbir şey uydurma.
3. DETAYLI anlat: her haberi 3-6 cümleyle işle — bağlam, arka plan ve sonucuyla. Yüzeysel geçme; günün öne çıkan olaylarını öne al, kalanları grupla.
4. 10-16 tur. Açılışta günü özetleyen bir giriş, kapanışta günün geniş özeti + veda.
5. turns[].speaker değeri DAİMA "Sunucu".
6. Toplam metin 6000 karakteri ASLA aşmasın.

Yanıt: SADECE geçerli JSON, markdown çiti olmadan:
{"title": "gün sonu özet başlığı (en fazla 90 karakter)", "speakers": [{"name": "Sunucu", "role": "deneyimli haber bülteni sunucusu"}], "turns": [{"speaker": "Sunucu", "text": "..."}]}`;

/** LLM senaryosu için haber materyali satırı. */
type NewsMaterial = { title: string; summary: string; category: string };

/** DB'deki newsIds JSON'undan seçilen haber kimliklerini okur. */
function parseStoredNewsIds(raw: string | null | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

async function collectMaterial(
  record: PodcastEpisodeRecord,
): Promise<NewsMaterial[]> {
  // Tek tık modu: owner belirli haberleri seçtiyse materyal TOPLAMA o
  // kısıya iner (removedAt=null + yayında şartı). Custom mod gibi davranır;
  // topic verilmişse ek talimat olarak kullanılır, verilmediyse başlığı YZ
  // belirler.
  const newsIds = parseStoredNewsIds(record.newsIds);

  if (newsIds.length > 0) {
    const rows = await prisma.newsItem.findMany({
      where: { id: { in: newsIds }, removedAt: null },
      select: { title: true, summary: true, category: true },
    });

    if (rows.length === 0) {
      throw new Error("Seçilen haberler bulunamadı veya kaldırılmış.");
    }

    return rows;
  }

  if (record.mode === "custom") {
    // Custom modda topic esas; category verilmişse ilgili son haberlerden
    // bağlam olarak take 6. Haber olmasa da topic ile devam edilir.
    if (!record.category) return [];

    const rows = await prisma.newsItem.findMany({
      where: { category: record.category, removedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { title: true, summary: true, category: true },
    });

    return rows;
  }

  const hours =
    record.mode === "hourly"
      ? 1
      : record.mode === "daily"
        ? 24
        : 24 * 7;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await prisma.newsItem.findMany({
    where: {
      createdAt: { gte: cutoff },
      removedAt: null,
      ...(record.category ? { category: record.category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { title: true, summary: true, category: true },
  });

  if (rows.length === 0) {
    throw new Error("Seçilen aralıkta haber bulunamadı.");
  }

  return rows;
}

async function generateScript(
  record: PodcastEpisodeRecord,
  material: NewsMaterial[],
): Promise<LlmScript> {
  const materialLines = material
    .map((item, index) => `${index + 1}. [${item.category}] ${item.title} — ${item.summary}`)
    .join("\n");

  const now = new Date();
  const timeLabel = `${String(now.getUTCHours() + 3).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`; // TR saati
  const dateLabel = now.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Istanbul",
  });

  const systemPrompt =
    record.mode === "hourly"
      ? HOURLY_SYSTEM_PROMPT
      : record.mode === "daily" && record.isAuto
        ? DAY_END_SYSTEM_PROMPT
        : SCRIPT_SYSTEM_PROMPT;

  const userPrompt = `BÖLÜM TÜRÜ: ${MODE_LABELS[record.mode] ?? record.mode}
KATEGORİ: ${record.category ?? "(tüm kategoriler)"}
TARİH: ${dateLabel}${record.mode === "hourly" ? ` · SAAT: ${timeLabel} (TSİ)` : ""}
${record.topic ? `ÖZEL KONU / TALİMAT: ${record.topic}` : ""}

HABER MATERYALİ (SADECE bunlardan bahset):
${materialLines.length > 0 ? materialLines : "(haber yok — özel konuyu temel al)"}

İstenen çıktı JSON şeması:
{"title": "en fazla 90 karakter", "speakers": [{"name": "Sunucu", "role": "deneyimli haber bülteni sunucusu"}], "turns": [{"speaker": "Sunucu", "text": "..."}]}`;

  const raw = await callLlm(systemPrompt, userPrompt);
  const script = parseLlmJson(raw, llmScriptSchema, "senaryo");

  return script;
}

// ─── TTS (lib/tts.ts deseni — Evren /v1/audio/speech, Voice Design) ──────────

/**
 * Tüm bölüm metnini TEK TTS isteğinde sentezler — LLM sağlayıcısının
 * OpenAI uyumlu /v1/audio/speech ucuyla (VoxCPM 2, lib/tts.ts deseni).
 *
 * NEDEN TEK İSTEK: Parçalı isteklerde her parça ayrı üretim olduğundan
 * ses karakteri akış boyunca kayıyordu; tek seferde gönderilen metinde
 * sağlayıcı cümle sınırlarından kendisi bölerek sesi uçtan uca tutarlı
 * tutar. Karakter sesi, profile özgü SABİT `instructions` (Voice Design)
 * tanımıyla şekillendirilir.
 *
 * Not: Önceden yerel edge-tts-api servisi kullanılıyordu; Microsoft'un
 * speech servisi VPS IP aralığını engellediği için sağlayıcıya geçildi.
 */
async function synthesizePodcastScript(
  text: string,
  instructions: string,
): Promise<Uint8Array> {
  const settings = await getSettings();

  if (!settings.providerUrl.trim() || !settings.apiKey.trim()) {
    throw new Error("TTS hatası: LLM sağlayıcısı yapılandırılmamış.");
  }

  const referenceAudio = await getReferenceAudio();

  const endpoint = resolveSpeechEndpoint(settings.providerUrl);
  const model = resolveTtsModel();

  let lastError = "";
  let lastStatus = 0;

  const attempt = async (): Promise<Uint8Array | null> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        // Türkçe karakterlerin (ç, ğ, ı, ö, ş, ü, İ) bozulmaması için UTF-8.
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model,
        voice: "default",
        ...(instructions ? { instructions } : {}),
        input: text,
        response_format: "mp3",
        // ── VoxCPM üretim parametreleri (ses kaymasını sınırlar) ──────────
        temperature: 0.25,
        top_p: 0.85,
        repetition_penalty: 1.15,
        // Model hesap hassasiyeti — fp16'daki boğuklaşma/pelteklik şikâyeti
        // nedeniyle bfloat16 istenir (sağlayıcı desteklediğinde etkindir).
        precision: "bfloat16",
        // ── Referans ses (voice prompt) ───────────────────────────────────
        ...(referenceAudio ? { reference_audio: referenceAudio } : {}),
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      lastError = truncate(
        (await response.text()).replace(/\s+/g, " "),
        300,
      );
      // 4xx kalıcı istemci hatası — yeniden denemek süre kaybı.
      lastStatus = response.status;
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      lastError = "boş ses yanıtı";
      return null;
    }

    return new Uint8Array(buffer);
  };

  // Uzun üretim geçici hatalara karşı 3 deneme — bölüm yarım kalmasın.
  for (let attemptNo = 0; attemptNo < 3; attemptNo += 1) {
    const audio = await attempt();

    if (audio) return audio;

    // Kalıcı istemci hatasında veya son denemeden sonra bekleme yok.
    if (lastStatus >= 400 && lastStatus < 500) break;
    if (attemptNo < 2) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }

  throw new Error(`TTS hatası${lastError ? `: ${lastError}` : ""}`);
}

// ─── Referans ses (voice prompt) ─────────────────────────────────────────────

/**
 * VoxCPM ses klonlama referansı: 5-8 saniyelik sabit, gürültüsüz kayıt
 * (public/referans.wav). Her TTS isteğine base64 olarak eklenir; dosya
 * yoksa istekler referanssız devam eder. Diskten yalnızca bir kez okunur.
 */
let referenceAudioB64: string | null | undefined;

async function getReferenceAudio(): Promise<string | null> {
  if (referenceAudioB64 !== undefined) return referenceAudioB64;

  try {
    const wav = await readFile(
      path.join(process.cwd(), "public", "referans.wav"),
    );
    referenceAudioB64 = wav.toString("base64");
  } catch {
    console.warn(
      "[podcast] public/referans.wav bulunamadı — TTS istekleri referanssız gönderilecek.",
    );
    referenceAudioB64 = null;
  }

  return referenceAudioB64;
}

// ─── İşleme hattı: senaryo ───────────────────────────────────────────────────

/**
 * Bir PodcastEpisode kaydını işler: haber materyali + LLM senaryosu +
 * voiceKey ataması. Hata durumunda kaydı "failed" yapar ve Türkçe hata
 * mesajı yazar; asla reject olmaz (video-news.ts deseni).
 */
export async function processPodcastEpisode(id: string): Promise<void> {
  if (scriptInFlight().has(id)) return;
  scriptInFlight().add(id);

  try {
    const record = await prisma.podcastEpisode.findUnique({ where: { id } });
    if (!record || record.status !== "processing") return;

    try {
      // 1) Gerçek haber materyali
      const material = await collectMaterial(record);

      // 2) LLM bülten senaryosu (tek konuşmacı: Sunucu)
      const answer = await generateScript(record, material);

      // 3) Ses ataması — script'e gömerek kalıcılaştır. Tek konuşmacılı
      // bültenlerde sunucu her zaman SABİT varsayılan sese (Emel) sahiptir;
      // owner isterse panelden değiştirir. Eski çok konuşmacılı kayıtlar
      // için deterministik hash ataması yedek olarak kalır.
      const voiceMap = assignVoiceKeys(answer.speakers.map((s) => s.name));
      const script: PodcastScript = {
        speakers: answer.speakers.map((speaker) => ({
          ...speaker,
          voiceKey:
            answer.speakers.length === 1
              ? "female_1"
              : voiceMap[speaker.name] ?? assignVoiceKey(speaker.name),
        })),
        turns: answer.turns,
      };

      await prisma.podcastEpisode.update({
        where: { id },
        data: {
          title: answer.title,
          script: JSON.stringify(script),
          status: "draft",
          error: null,
        },
      });

      auditLog("podcast.script.ready", {
        episodeId: id,
        mode: record.mode,
        speakers: script.speakers.length,
        turns: script.turns.length,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      try {
        await prisma.podcastEpisode.update({
          where: { id },
          data: { status: "failed", error: message },
        });
      } catch (updateError) {
        auditLog("podcast.state-update-failed", {
          episodeId: id,
          error: getErrorMessage(updateError),
        });
      }

      auditLog("podcast.script.failed", { episodeId: id, error: message });
    }
  } catch (error) {
    // Arka planda ateşlendiği için bu fonksiyon ASLA reject olmamalı.
    auditLog("podcast.process-error", {
      episodeId: id,
      error: getErrorMessage(error),
    });
  } finally {
    scriptInFlight().delete(id);
  }
}

/** Yeni bölüm kaydı oluşturur ve senaryo üretimini arka planda başlatır. */
export async function submitPodcastEpisode(
  input: PodcastSubmitInput,
): Promise<PodcastEpisodeRecord> {
  const record = await prisma.podcastEpisode.create({
    data: {
      mode: input.mode,
      category: input.category ?? null,
      topic: input.topic?.trim() || null,
      newsIds:
        input.newsIds && input.newsIds.length > 0
          ? JSON.stringify(input.newsIds)
          : null,
      status: "processing",
    },
  });

  auditLog("podcast.submitted", {
    episodeId: record.id,
    mode: record.mode,
    category: record.category,
  });

  // Arka planda işle — submit çağıranı bekletme.
  void processPodcastEpisode(record.id);

  return record;
}

// ─── Senaryo düzenleme (owner) ───────────────────────────────────────────────

/**
 * Owner senaryo düzenlemesi: turns[] tamamen değiştirilebilir; speakers
 * sabittir ama voiceKey'leri (karakter sesleri) değiştirilebilir. Mevcut
 * ses varsa geçersiz kılınır (audio=null, status=draft, playedAt sıfırlanır
 * — yeni ses tekrar dinlenmelidir).
 */
export async function updatePodcastEpisodeScript(
  id: string,
  turns: PodcastTurn[],
  speakerVoices?: Record<string, PodcastVoiceKey>,
): Promise<PodcastEpisodeRecord> {
  const record = await prisma.podcastEpisode.findUnique({ where: { id } });

  if (!record) {
    throw new PodcastError("NOT_FOUND", "Podcast kaydı bulunamadı.");
  }

  const script = parsePodcastScript(record.script);

  if (!script) {
    throw new PodcastError(
      "NOT_READY",
      "Düzenlenecek senaryo bulunamadı — bölümün işlemenin bitmesini bekleyin.",
    );
  }

  const speakerNames = new Set(script.speakers.map((speaker) => speaker.name));

  for (const turn of turns) {
    if (!speakerNames.has(turn.speaker)) {
      throw new PodcastError(
        "INVALID_SCRIPT",
        `Bilinmeyen konuşmacı: "${turn.speaker}" — speakers sabittir.`,
      );
    }
  }

  const speakers = script.speakers.map((speaker) => ({ ...speaker }));

  if (speakerVoices) {
    for (const [name, voiceKey] of Object.entries(speakerVoices)) {
      const speaker = speakers.find((item) => item.name === name);

      if (!speaker) {
        throw new PodcastError(
          "INVALID_SCRIPT",
          `Bilinmeyen konuşmacı: "${name}" — speakers sabittir.`,
        );
      }

      speaker.voiceKey = voiceKey;
    }
  }

  const nextScript: PodcastScript = { speakers, turns };

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: {
      script: JSON.stringify(nextScript),
      status: "draft",
      audio: null,
      audioDurationSec: null,
      playedAt: null,
      error: null,
    },
  });

  auditLog("podcast.script.updated", {
    episodeId: id,
    turns: turns.length,
  });

  return updated;
}

// ─── Ses üretimi ─────────────────────────────────────────────────────────────

/**
 * Ses üretimini başlatır (draft/failed → audio_processing) ve işlemeyi arka
 * planda yürütür. playedAt sıfırlanır — yeni ses yayınlanmadan önce TEKRAR
 * dinlenmelidir (kilit yeni ses için yeniden devreye girer).
 */
export async function generatePodcastAudio(
  id: string,
): Promise<PodcastEpisodeRecord> {
  const record = await prisma.podcastEpisode.findUnique({ where: { id } });

  if (!record) {
    throw new PodcastError("NOT_FOUND", "Podcast kaydı bulunamadı.");
  }

  if (record.status !== "draft" && record.status !== "failed") {
    throw new PodcastError(
      "INVALID_STATE",
      "Ses üretimi yalnızca taslak (draft) bölümler için başlatılabilir.",
    );
  }

  const script = parsePodcastScript(record.script);

  if (!script || script.turns.length === 0) {
    throw new PodcastError(
      "NOT_READY",
      "Senaryo bulunamadı — önce bölüm senaryosunun üretilmiş olması gerekir.",
    );
  }

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: {
      status: "audio_processing",
      audio: null,
      audioDurationSec: null,
      playedAt: null,
      error: null,
    },
  });

  auditLog("podcast.audio.queued", { episodeId: id, turns: script.turns.length });

  // Arka planda işle — istek 202 ile döner.
  void processPodcastAudio(id);

  return updated;
}

/**
 * Arka plan ses üretimi: TÜM senaryo metni tek istede sentezlenir (tek
 * sesli bülten — parçalı üretim ses karakterini akış boyunca bozuyordu;
 * tek seferde sağlayıcı cümle sınırlarından kendisi bölerek sesi uçtan
 * uca tutarlı tutar). Sonuç episode.audio'ya (Bytes) yazılır.
 * Asla reject olmaz.
 */
async function processPodcastAudio(id: string): Promise<void> {
  if (audioInFlight().has(id)) return;
  audioInFlight().add(id);

  try {
    const record = await prisma.podcastEpisode.findUnique({ where: { id } });

    if (!record || record.status !== "audio_processing") return;

    const script = parsePodcastScript(record.script);

    if (!script) {
      throw new Error("Senaryo okunamadı — bölümü yeniden üretin.");
    }

    // Tüm tur metinleri TEK metin olarak birleştirilir ve TEK istekte
    // sentezlenir. Ses, ilk turun konuşmacısının (sunucu) karakter sesiyle
    // üretilir — tek sesli bülten tasarımı.
    const anchorSpeaker =
      script.speakers.find((s) => s.name === script.turns[0].speaker) ??
      script.speakers[0];
    const voice = getPodcastVoice(anchorSpeaker?.voiceKey);

    // TTS öncesi metin temizliği: tırnak/parantez/tire vb. özel karakterler
    // VoxCPM'de pelteklik ve kelime yutma yarattığından atılır; Türkçe
    // harfler, rakamlar, nokta ve virgül korunur.
    const fullText = sanitizeTtsText(
      script.turns
        .map((turn) => turn.text.trim())
        .filter((text) => text.length > 0)
        .join(" "),
    );

    if (fullText.length === 0) {
      throw new Error("Senaryo metni boş — bölümü düzenleyin.");
    }

    const audio = await synthesizePodcastScript(fullText, voice.instructions);
    const merged = Buffer.from(audio);

    const audioDurationSec = Math.max(
      1,
      Math.round(fullText.length / CHARS_PER_SECOND),
    );

    await prisma.podcastEpisode.update({
      where: { id },
      data: {
        audio: merged,
        audioDurationSec,
        status: "ready",
        error: null,
      },
    });

    auditLog("podcast.audio.ready", {
      episodeId: id,
      bytes: merged.length,
      turns: script.turns.length,
      estimatedDurationSec: audioDurationSec,
    });
  } catch (error) {
    const message = getErrorMessage(error);

    try {
      await prisma.podcastEpisode.update({
        where: { id },
        data: { status: "failed", error: message },
      });
    } catch (updateError) {
      auditLog("podcast.state-update-failed", {
        episodeId: id,
        error: getErrorMessage(updateError),
      });
    }

    auditLog("podcast.audio.failed", { episodeId: id, error: message });
  } finally {
    audioInFlight().delete(id);
  }
}

// ─── Oynatma kilidi ve yayınlama ─────────────────────────────────────────────

/** Owner bölümü dinledi — playedAt'i işaretler (idempotent). */
export async function markPodcastPlayed(
  id: string,
): Promise<PodcastEpisodeRecord> {
  const record = await prisma.podcastEpisode.findUnique({ where: { id } });

  if (!record) {
    throw new PodcastError("NOT_FOUND", "Podcast kaydı bulunamadı.");
  }

  // Sadece null ise set et — tekrar dinleme zaman damgasını değiştirmez.
  if (record.playedAt !== null) return record;

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: { playedAt: new Date() },
  });

  auditLog("podcast.played", { episodeId: id });

  return updated;
}

/**
 * ready durumdaki bölümü yayımlar. Owner sesi DİNLEMEMİŞSE (playedAt null)
 * yayımlamaz — "Önce podcast'i dinlemelisiniz".
 */
export async function publishPodcastEpisode(
  id: string,
): Promise<PodcastEpisodeRecord> {
  const record = await prisma.podcastEpisode.findUnique({ where: { id } });

  if (!record) {
    throw new PodcastError("NOT_FOUND", "Podcast kaydı bulunamadı.");
  }

  if (!record.playedAt) {
    throw new PodcastError("NOT_PLAYED", "Önce podcast'i dinlemelisiniz");
  }

  if (record.status === "published") {
    throw new PodcastError("ALREADY_PUBLISHED", "Bu bölüm zaten yayımlanmış.");
  }

  if (record.status !== "ready") {
    throw new PodcastError(
      "NOT_READY",
      "Bölüm henüz hazır değil — ses üretiminin bitmesini bekleyin.",
    );
  }

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: { status: "published", publishedAt: new Date() },
  });

  auditLog("podcast.published", { episodeId: id });

  return updated;
}

// ─── DTO (ses bytes HARİÇ) ───────────────────────────────────────────────────

export type PodcastEpisodeDto = {
  id: string;
  title: string | null;
  mode: string;
  category: string | null;
  topic: string | null;
  newsIds: string[];
  script: PodcastScript | null;
  status: string;
  hasAudio: boolean;
  audioDurationSec: number | null;
  playedAt: string | null;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializePodcastEpisode(
  record: PodcastEpisodeRecord,
): PodcastEpisodeDto {
  return {
    id: record.id,
    title: record.title,
    mode: record.mode,
    category: record.category,
    topic: record.topic,
    newsIds: parseStoredNewsIds(record.newsIds),
    script: parsePodcastScript(record.script),
    status: record.status,
    hasAudio: record.audio !== null && record.audio.length > 0,
    audioDurationSec: record.audioDurationSec,
    playedAt: record.playedAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Herkese açık podcast listesi öğesi — senaryo metni YOK. */
export type PublicPodcastEpisodeDto = {
  id: string;
  title: string | null;
  mode: string;
  category: string | null;
  publishedAt: string | null;
  audioDurationSec: number | null;
  hasAudio: boolean;
  speakers: Array<{ name: string; role: string }>;
};

export function serializePublicPodcastEpisode(
  record: PodcastEpisodeRecord,
): PublicPodcastEpisodeDto {
  const script = parsePodcastScript(record.script);

  return {
    id: record.id,
    title: record.title,
    mode: record.mode,
    category: record.category,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    audioDurationSec: record.audioDurationSec,
    hasAudio: record.audio !== null && record.audio.length > 0,
    speakers: script
      ? script.speakers.map((speaker) => ({
          name: speaker.name,
          role: speaker.role,
        }))
      : [],
  };
}

// ─── Otomatik radyo (cron): saatlik bülten + gün sonu özeti ─────────────────

/**
 * Otomatik bölüm üretim zinciri: kayıt → senaryo → ses → otomatik yayın.
 * Owner onayı olmadan çalışır (oynatma kilidi isAuto bölümlerinde atlanır);
 * içerik kalitesini zaten saatlik gemma denetimi ve LLM sentez kapısı sağlar.
 * Asla reject olmaz — hatalar auditLog'a yazılır.
 */
/** Prisma satır tipi (audio Bytes → Buffer). */
type PodcastEpisodeRow = NonNullable<
  Awaited<ReturnType<typeof prisma.podcastEpisode.findUnique>>
>;

async function waitForPodcastStatus(
  id: string,
  statuses: string[],
  timeoutMs: number,
): Promise<PodcastEpisodeRow | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const record = await prisma.podcastEpisode.findUnique({ where: { id } });

    if (!record) return null;
    if (statuses.includes(record.status)) return record;

    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  return null;
}

async function produceAutoEpisode(mode: "hourly" | "daily"): Promise<boolean> {
  const record = await prisma.podcastEpisode.create({
    data: { mode, status: "processing", isAuto: true },
  });

  auditLog("podcast.auto.started", { episodeId: record.id, mode });

  // 1) Senaryo (hatayı içeride yakalar; failed yapar).
  await processPodcastEpisode(record.id);

  let current = await prisma.podcastEpisode.findUnique({
    where: { id: record.id },
  });

  if (!current || current.status !== "draft") {
    auditLog("podcast.auto.script-failed", {
      episodeId: record.id,
      mode,
      error: current?.error ?? "bilinmeyen",
    });
    return false;
  }

  // 2) Ses — arka plan işi başlar, bitmesi beklenir (uzun metin dakikalar sürer).
  await generatePodcastAudio(record.id);

  current = await waitForPodcastStatus(
    record.id,
    ["ready", "failed"],
    25 * 60_000,
  );

  if (!current || current.status !== "ready") {
    auditLog("podcast.auto.audio-failed", {
      episodeId: record.id,
      mode,
      error: current?.error ?? "zaman aşımı",
    });
    return false;
  }

  // 3) Otomatik yayın — oynatma kilidi yalnızca owner bölümleri içindir.
  await prisma.podcastEpisode.update({
    where: { id: record.id },
    data: { playedAt: new Date() },
  });

  try {
    await publishPodcastEpisode(record.id);
  } catch (error) {
    auditLog("podcast.auto.publish-failed", {
      episodeId: record.id,
      mode,
      error: getErrorMessage(error),
    });
    return false;
  }

  auditLog("podcast.auto.published", {
    episodeId: record.id,
    mode,
    title: current.title,
  });

  return true;
}

/** Aynı anda tek tick — örtüşen cron tıkları sessizce atlanır. */
function autoTickGuard(): Set<string> {
  const globalForRadio = globalThis as unknown as {
    __podcastAutoTicks?: Set<string>;
  };
  globalForRadio.__podcastAutoTicks ??= new Set<string>();
  return globalForRadio.__podcastAutoTicks;
}

/**
 * Saatlik radyo tığı: son 1 saatin haberlerinden kısa bülten üretir.
 * Atlar: son 55 dakikada bölüm üretilmişse ya da yeni haber < 3 ise.
 */
export async function runHourlyRadioTick(): Promise<boolean> {
  const guard = autoTickGuard();
  if (guard.has("hourly")) return false;

  const latest = await prisma.podcastEpisode.findFirst({
    where: { mode: "hourly", isAuto: true },
    orderBy: { createdAt: "desc" },
  });

  if (latest && Date.now() - latest.createdAt.getTime() < 55 * 60_000) {
    return false;
  }

  const cutoff = new Date(Date.now() - 65 * 60_000);
  const newsCount = await prisma.newsItem.count({
    where: { createdAt: { gte: cutoff }, removedAt: null },
  });

  if (newsCount < 3) return false;

  guard.add("hourly");
  try {
    await pruneAutoEpisodes();
    return await produceAutoEpisode("hourly");
  } catch (error) {
    auditLog("podcast.auto.tick-failed", {
      mode: "hourly",
      error: getErrorMessage(error),
    });
    return false;
  } finally {
    guard.delete("hourly");
  }
}

/**
 * Gün sonu tığı: son 24 saatin TÜM haberlerinden detaylı özet üretir.
 * Atlar: son 20 saatte gün sonu özeti üretilmişse ya da 24 saatlik haber < 5 ise.
 */
export async function runDayEndDigestTick(): Promise<boolean> {
  const guard = autoTickGuard();
  if (guard.has("daily")) return false;

  const latest = await prisma.podcastEpisode.findFirst({
    where: { mode: "daily", isAuto: true },
    orderBy: { createdAt: "desc" },
  });

  if (latest && Date.now() - latest.createdAt.getTime() < 20 * 60 * 60_000) {
    return false;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const newsCount = await prisma.newsItem.count({
    where: { createdAt: { gte: cutoff }, removedAt: null },
  });

  if (newsCount < 5) return false;

  guard.add("daily");
  try {
    return await produceAutoEpisode("daily");
  } catch (error) {
    auditLog("podcast.auto.tick-failed", {
      mode: "daily",
      error: getErrorMessage(error),
    });
    return false;
  } finally {
    guard.delete("daily");
  }
}

/**
 * Depolama temizliği: otomatik saatlik bölümler 7 gün, gün sonu özetleri
 * 30 gün sonra silinir (ses Bytes olarak DB'de birikir).
 */
async function pruneAutoEpisodes(): Promise<void> {
  const hourlyCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const dailyCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  const hourly = await prisma.podcastEpisode.deleteMany({
    where: { isAuto: true, mode: "hourly", createdAt: { lt: hourlyCutoff } },
  });
  const daily = await prisma.podcastEpisode.deleteMany({
    where: { isAuto: true, mode: "daily", createdAt: { lt: dailyCutoff } },
  });

  if (hourly.count > 0 || daily.count > 0) {
    auditLog("podcast.auto.pruned", {
      hourly: hourly.count,
      daily: daily.count,
    });
  }
}
