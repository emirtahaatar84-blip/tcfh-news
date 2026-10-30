import { z } from "zod";
import type { VideoNews } from "@prisma/client";
import { isAdminAuthorized } from "@/lib/auth";
import { CATEGORIES, normalizeCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { uniqueNewsSlug } from "@/lib/unique-slug";
import { getSettings } from "@/lib/settings";
import {
  extractJsonObject,
  getErrorMessage,
  resolveChatCompletionsUrl,
  truncate,
} from "@/lib/utils";

/**
 * Video Haber çekirdeği: YouTube linki → transkript → LLM ile özgün Türkçe
 * haber → owner onayı (videoyu OYNATMA kilidi) → NewsItem olarak yayım.
 *
 * Akış x-studio.ts ile aynı desenleri izler: settings'ten LLM yapılandırması,
 * `chat_template_kwargs: { enable_thinking: false }` (model askıda kalmasın
 * diye ZORUNLU), zod doğrulama ve bellek içi iş takibi + DB durum takibi.
 *
 * Durum makinesi:
 *   processing → ready    (transkript + LLM başarılı)
 *   processing → failed   (altyazı yok / fetch veya LLM hatası)
 *   failed     → processing (retry uç noktası)
 *   ready      → published (owner oynattıysa; publish uç noktası)
 */

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Uzun videolar için transkript bütçesi. */
const MAX_TRANSCRIPT_CHARS = 15_000;

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

const WATCH_PATH_SEGMENTS = new Set(["shorts", "embed", "live", "v"]);

// ─── Zod şemaları (endpoint'lerle paylaşılır) ────────────────────────────────

/** LLM'den beklenen haber çıktısı. */
const llmAnswerSchema = z.object({
  title: z.string().trim().min(1).max(110),
  summary: z.string().trim().min(1).max(220),
  content: z.string().trim().min(1),
  category: z
    .string()
    .transform((value) => normalizeCategory(value, "Diğer"))
    .refine((value) => (CATEGORIES as readonly string[]).includes(value)),
  readTime: z.coerce.number().int().min(1).max(8),
});

/** POST /api/video-news gövdesi. */
export const videoNewsSubmitSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "YouTube linki gerekli.")
    .max(500, "Link çok uzun.")
    .refine((value) => extractYouTubeId(value) !== null, {
      message: "Geçerli bir YouTube linki girin (youtube.com veya youtu.be).",
    }),
});

// ─── YouTube yardımcıları ────────────────────────────────────────────────────

/** watch?v=, youtu.be/, shorts/ formatlarından 11 karakterlik video kimliğini çıkarır. */
export function extractYouTubeId(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.replace(/^(www|m|music)\./i, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  const queryId = parsed.searchParams.get("v") ?? "";
  if (VIDEO_ID_PATTERN.test(queryId)) return queryId;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 2 &&
    WATCH_PATH_SEGMENTS.has(segments[0].toLowerCase())
  ) {
    const id = segments[1];
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  return null;
}

type OEmbedInfo = {
  videoTitle: string | null;
  channel: string | null;
  thumbnailUrl: string | null;
};

/** oEmbed üzerinden video başlığı, kanal ve küçük resim bilgisini çeker. */
async function fetchOEmbed(url: string): Promise<OEmbedInfo> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  const response = await fetch(endpoint, {
    headers: { "User-Agent": DESKTOP_UA },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 400
        ? "Video bulunamadı — linki kontrol edin."
        : `Video bilgileri alınamadı (HTTP ${response.status}).`,
    );
  }

  const payload = (await response.json()) as {
    title?: unknown;
    author_name?: unknown;
    thumbnail_url?: unknown;
  };

  return {
    videoTitle: typeof payload.title === "string" ? payload.title : null,
    channel:
      typeof payload.author_name === "string" ? payload.author_name : null,
    thumbnailUrl:
      typeof payload.thumbnail_url === "string"
        ? payload.thumbnail_url
        : null,
  };
}

/**
 * Metin içinde bir işaretçiden sonra başlayan ilk JSON nesnesini, dize
 * farkındalıklı parantez eşlemesiyle çıkarır (ytInitialPlayerResponse gibi
 * gömülü JSON'lar regex ile güvenle yakalanamaz).
 */
function extractEmbeddedJson(html: string, marker: string): unknown {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const start = html.indexOf("{", markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

type CaptionTrack = {
  baseUrl?: unknown;
  languageCode?: unknown;
};

/** Video sayfasındaki ytInitialPlayerResponse'ın gömülü olduğundan emin ol. */
function isPlayerResponsePayload(value: unknown): value is {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: unknown[];
    };
  };
} {
  return typeof value === "object" && value !== null && "captions" in value;
}

/**
 * İzleme sayfasını fetch edip altyazı track'lerinden transkripti çıkarır.
 * Türkçe ("tr" / "tr-orig") track'i tercih eder, yoksa ilkini kullanır.
 */
async function fetchTranscript(videoId: string): Promise<string> {
  const response = await fetch(
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=tr`,
    {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Video sayfası alınamadı (HTTP ${response.status}).`);
  }

  const html = await response.text();
  const playerResponse = extractEmbeddedJson(html, "ytInitialPlayerResponse");

  if (!isPlayerResponsePayload(playerResponse)) {
    throw new Error(
      "Video bilgisi sayfadan okunamadı — video gizli, yaş sınırlı veya silinmiş olabilir.",
    );
  }

  const rawTracks =
    playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    throw new Error(
      "Bu videoda altyazı bulunamadı — haber üretilemedi.",
    );
  }

  const tracks: CaptionTrack[] = rawTracks.filter(
    (track): track is CaptionTrack =>
      typeof track === "object" && track !== null,
  );

  const pick =
    tracks.find(
      (track) =>
        typeof track.languageCode === "string" &&
        track.languageCode.toLowerCase() === "tr-orig",
    ) ??
    tracks.find(
      (track) =>
        typeof track.languageCode === "string" &&
        track.languageCode.toLowerCase().startsWith("tr"),
    ) ??
    tracks[0];

  const baseUrl = pick?.baseUrl;

  if (typeof baseUrl !== "string" || !baseUrl.startsWith("http")) {
    throw new Error("Altyazı adresi okunamadı.");
  }

  const captionResponse = await fetch(`${baseUrl}&fmt=json3`, {
    headers: { "User-Agent": DESKTOP_UA },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });

  if (!captionResponse.ok) {
    throw new Error(
      `Altyazı indirilemedi (HTTP ${captionResponse.status}).`,
    );
  }

  const payload = (await captionResponse.json()) as {
    events?: unknown;
  };

  if (!Array.isArray(payload.events)) {
    throw new Error("Altyazı içeriği okunamadı.");
  }

  const lines: string[] = [];

  for (const event of payload.events) {
    if (typeof event !== "object" || event === null) continue;
    const segs = (event as { segs?: unknown }).segs;
    if (!Array.isArray(segs)) continue;

    const line = segs
      .map((seg) =>
        typeof seg === "object" && seg !== null
          ? String((seg as { utf8?: unknown }).utf8 ?? "")
          : "",
      )
      .join("")
      .replace(/\n/g, " ")
      .trim();

    if (line) lines.push(line);
  }

  const transcript = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!transcript) {
    throw new Error("Bu videoda altyazı bulunamadı — haber üretilemedi.");
  }

  return transcript;
}

// ─── LLM üretimi (x-studio.ts çağrı deseni) ─────────────────────────────────

const SYSTEM_PROMPT = `Sen bir haber editörüsün. Verilen video transkriptinden ÖZGÜN, TELİF HAKKI İHLAL ETMEYEN bir Türkçe haber yaz. Transkripti aynen kopyalama, kendi cümlelerinle yeniden yaz. Dürüst ol: transkriptte olmayan bilgi uydurma.

Yanıt: SADECE geçerli JSON, markdown çiti olmadan:
{"title": "...", "summary": "...", "content": "...", "category": "...", "readTime": 3}

Kurallar:
- title: en fazla 110 karakter, haber başlığı.
- summary: en fazla 220 karakter, tek paragraf özet.
- content: markdown, 3-6 paragraf, gerekiyorsa "## " alt başlıklar kullan.
- category: SADECE şu değerlerden biri: ${CATEGORIES.join(", ")}.
- readTime: tahmini okuma süresi (dakika, 1-8).`;

const LLM_OUTPUT_SCHEMA_HINT = `{"title": "en fazla 110 karakter", "summary": "en fazla 220 karakter, tek paragraf", "content": "markdown, 3-6 paragraf, alt başlıklar kullanabilir", "category": "${CATEGORIES.join('" | "')}", "readTime": 1-8 arası dakika}`;

type LlmAnswer = z.infer<typeof llmAnswerSchema>;

/** Transkripti LLM'e gönderip doğrulanmış haber üretir. */
async function generateNewsFromTranscript(input: {
  transcript: string;
  videoTitle: string | null;
  channel: string | null;
}): Promise<LlmAnswer> {
  const settings = await getSettings();

  if (!settings.apiKey.trim() || !settings.providerUrl.trim()) {
    throw new Error("LLM sağlayıcısı yapılandırılmamış.");
  }

  const wasTruncated = input.transcript.length > MAX_TRANSCRIPT_CHARS;
  const transcript = wasTruncated
    ? input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)
    : input.transcript;

  const userPrompt = `VİDEO BİLGİSİ:
Video başlığı: ${input.videoTitle ?? "(bilinmiyor)"}
Kanal: ${input.channel ?? "(bilinmiyor)"}

TRANSKRİPT${wasTruncated ? " (uzun olduğu için ilk ~15000 karaktere kısaltıldı)" : ""}:
${transcript}

İstenen çıktı JSON şeması:
${LLM_OUTPUT_SCHEMA_HINT}`;

  const response = await fetch(resolveChatCompletionsUrl(settings.providerUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelName,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      // Model (qwen3.8-flash-next) "thinking" modunda kısıtlı promptlarda
      // dakikalarca reasoning yapıp zaman aşımına düşüyor — kapatmak zorunlu.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate(
      (await response.text()).replace(/\s+/g, " "),
      200,
    );
    throw new Error(`LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const raw = payload.choices?.[0]?.message?.content;

  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("LLM yanıtı boş döndü.");
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("LLM yanıtı geçerli JSON değildi.");
  }

  const parsed = llmAnswerSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `LLM çıktısı doğrulanamadı: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(kök)"}: ${issue.message}`)
        .join("; ")
        .slice(0, 300)}`,
    );
  }

  return parsed.data;
}

// ─── Bellek içi iş takibi (çift işlemeyi önler) ──────────────────────────────

const globalForVideoNews = globalThis as unknown as {
  videoNewsInFlight?: Set<string>;
};

function inFlight(): Set<string> {
  if (!globalForVideoNews.videoNewsInFlight) {
    globalForVideoNews.videoNewsInFlight = new Set<string>();
  }
  return globalForVideoNews.videoNewsInFlight;
}

// ─── Yapılandırılmış audit kaydı ─────────────────────────────────────────────

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
export async function isVideoNewsAuthorized(request: Request): Promise<boolean> {
  return isAdminAuthorized(request);
}

// ─── İşleme hattı ────────────────────────────────────────────────────────────

/**
 * Bir VideoNews kaydını işler: meta + transkript + LLM. Hata durumunda
 * kaydı "failed" yapar ve Türkçe hata mesajı yazar; asla reject olmaz.
 */
export async function processVideoNews(id: string): Promise<void> {
  if (inFlight().has(id)) return;
  inFlight().add(id);

  try {
    const record = await prisma.videoNews.findUnique({ where: { id } });
    if (!record) return;

    const videoId = extractYouTubeId(record.url) ?? record.youtubeId;

    try {
      // 1) Video meta bilgileri (oEmbed)
      const meta = await fetchOEmbed(
        `https://www.youtube.com/watch?v=${videoId}`,
      );

      // 2) Transkript (altyazı)
      const transcript = await fetchTranscript(videoId);

      // 3) LLM ile özgün haber üretimi
      const answer = await generateNewsFromTranscript({
        transcript,
        videoTitle: meta.videoTitle ?? record.videoTitle,
        channel: meta.channel ?? record.channel,
      });

      await prisma.videoNews.update({
        where: { id },
        data: {
          videoTitle: meta.videoTitle ?? record.videoTitle,
          channel: meta.channel ?? record.channel,
          thumbnailUrl: meta.thumbnailUrl ?? record.thumbnailUrl,
          transcript,
          title: answer.title,
          summary: answer.summary,
          content: answer.content,
          category: answer.category,
          readTime: answer.readTime,
          status: "ready",
          error: null,
        },
      });

      auditLog("video-news.processed", {
        videoNewsId: id,
        youtubeId: videoId,
        category: answer.category,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      // Hata durumunu DB'ye yaz; o da başarısız olursa sadece logla.
      try {
        await prisma.videoNews.update({
          where: { id },
          data: { status: "failed", error: message },
        });
      } catch (updateError) {
        auditLog("video-news.state-update-failed", {
          videoNewsId: id,
          error: getErrorMessage(updateError),
        });
      }

      auditLog("video-news.failed", {
        videoNewsId: id,
        youtubeId: videoId,
        error: message,
      });
    }
  } catch (error) {
    // Arka planda ateşlendiği için bu fonksiyon ASLA reject olmamalı.
    auditLog("video-news.process-error", {
      videoNewsId: id,
      error: getErrorMessage(error),
    });
  } finally {
    inFlight().delete(id);
  }
}

/**
 * Yeni video haberi kaydı oluşturur ve işlemeyi arka planda başlatır.
 * Aynı video zaten gönderilmişse mevcut kaydı döndürür (mükerrer engeli).
 */
export async function submitVideoNews(url: string): Promise<VideoNews> {
  const youtubeId = extractYouTubeId(url);

  if (!youtubeId) {
    throw new Error("Geçerli bir YouTube linki girin (youtube.com veya youtu.be).");
  }

  const existing = await prisma.videoNews.findUnique({
    where: { youtubeId },
  });

  if (existing) {
    // Daha önce failed olan bir video tekrar gönderilirse yeniden işlesin;
    // processing/ready/published olanlarda dokunma.
    if (existing.status === "failed") {
      await prisma.videoNews.update({
        where: { id: existing.id },
        data: { status: "processing", error: null },
      });
      void processVideoNews(existing.id);
    }

    return { ...existing, status: existing.status === "failed" ? "processing" : existing.status };
  }

  const record = await prisma.videoNews.create({
    data: {
      youtubeId,
      url,
      status: "processing",
    },
  });

  auditLog("video-news.submitted", { videoNewsId: record.id, youtubeId });

  // Arka planda işle — submit çağıranı bekletme (x-studio kuyruk deseni).
  void processVideoNews(record.id);

  return record;
}

// ─── Yayınlama (owner onay kilidi) ───────────────────────────────────────────

/** Bilinen hata türleri — uç noktalar HTTP durum koduna çevirir. */
export type VideoNewsErrorCode =
  | "NOT_FOUND"
  | "NOT_PLAYED"
  | "NOT_READY"
  | "ALREADY_PUBLISHED";

export class VideoNewsError extends Error {
  readonly code: VideoNewsErrorCode;

  constructor(code: VideoNewsErrorCode, message: string) {
    super(message);
    this.name = "VideoNewsError";
    this.code = code;
  }
}

/**
 * ready durumdaki video haberini NewsItem olarak yayımlar. Video owner
 * tarafından OYNATILMAMIŞSA (playedAt null) yayımlamaz.
 */
export async function publishVideoNews(id: string): Promise<string> {
  const record = await prisma.videoNews.findUnique({ where: { id } });

  if (!record) {
    throw new VideoNewsError("NOT_FOUND", "Video haber kaydı bulunamadı.");
  }

  if (!record.playedAt) {
    throw new VideoNewsError("NOT_PLAYED", "Önce videoyu oynatmalısınız");
  }

  if (record.status === "published" && record.newsItemId) {
    throw new VideoNewsError(
      "ALREADY_PUBLISHED",
      "Bu video haberi zaten yayımlanmış.",
    );
  }

  if (record.status !== "ready" || !record.title || !record.summary || !record.content) {
    throw new VideoNewsError(
      "NOT_READY",
      "Haber henüz hazır değil — işlemenin bitmesini bekleyin.",
    );
  }

  const newsItem = await prisma.newsItem.create({
    data: {
      slug: await uniqueNewsSlug(record.title),
      title: record.title,
      // Video haberi: kaynak görsel (YouTube küçük resmi) — telif: kendi
      // yüklediğimiz içerik değilse AI kapağı tercih edilir.
      imageCredit: null,
      summary: record.summary,
      detailedContent: record.content,
      category: record.category ?? "Diğer",
      sourcesCount: 1,
      sourcesList: JSON.stringify([
        record.channel ? `YouTube — ${record.channel}` : "YouTube",
      ]),
      imageUrl: record.thumbnailUrl,
      isVideo: true,
      youtubeId: record.youtubeId,
    },
  });

  await prisma.videoNews.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
      newsItemId: newsItem.id,
    },
  });

  auditLog("video-news.published", {
    videoNewsId: id,
    newsItemId: newsItem.id,
    youtubeId: record.youtubeId,
  });

  return newsItem.id;
}

// ─── DTO (transkript HARİÇ — payload şişmesin) ───────────────────────────────

export type VideoNewsDto = {
  id: string;
  youtubeId: string;
  url: string;
  videoTitle: string | null;
  channel: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  summary: string | null;
  content: string | null;
  category: string | null;
  readTime: number | null;
  status: string;
  playedAt: string | null;
  publishedAt: string | null;
  newsItemId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeVideoNews(record: VideoNews): VideoNewsDto {
  return {
    id: record.id,
    youtubeId: record.youtubeId,
    url: record.url,
    videoTitle: record.videoTitle,
    channel: record.channel,
    thumbnailUrl: record.thumbnailUrl,
    title: record.title,
    summary: record.summary,
    content: record.content,
    category: record.category,
    readTime: record.readTime,
    status: record.status,
    playedAt: record.playedAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    newsItemId: record.newsItemId,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
