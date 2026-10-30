import { getSettings } from "@/lib/settings";
import { extractJsonObject } from "@/lib/utils";
import { callLlm, type LlmProviderId } from "@/lib/llm-providers";

/**
 * Sunucu tarafı AI yardımcıları (asistan, özet, karşılaştırma, brifing).
 *
 * KVKK: API anahtarı yalnızca sunucuda (SystemSettings tablosu) tutulur ve
 * istemciye asla gönderilmez. Kullanıcı mesajları SAKLANMAZ; her istek
 * bağımsızdır. IP adresi okunmaz, loglanmaz.
 *
 * Sağlık/hukuk/finans tavsiyesi verilmez; model buna göre yönlendirilir.
 */

const TIMEOUT_MS = 30_000;

const SAFETY_RULES = `Kurallar:
- Yalnızca sana verilen bağlamdaki haberlere dayan. Bağlamda olmayan bilgi uydurma.
- Tıbbi, hukuki veya finansal tavsiye verme; böyle bir soruda kibarca reddet.
- Kısa, doğal ve akıcı Türkçe kullan. Tarafsız ol; siyasi yorum katma.
- Kişisel veri isteme, kullanıcı hakkında çıkarım yapma.`;

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export class AiUnavailableError extends Error {
  constructor(message = "AI servisi yapılandırılmamış.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

type CompletionOptions = {
  messages: AiMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

/** OpenAI uyumlu sağlayıcıya istek atar; anahtar sunucuda kalır. */
export async function complete(options: CompletionOptions): Promise<string> {
  const settings = await getSettings();

  const apiKey = settings.apiKey?.trim();
  if (!apiKey) throw new AiUnavailableError();

  // ÇOKLU SAĞLAYICI: OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter /
  // Groq / Mistral / Ollama — hepsi tek arayüzden.
  const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = options.messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");

  const result = await callLlm({
    provider: (settings.llmProvider as LlmProviderId) ?? "openai",
    baseUrl: settings.providerUrl,
    apiKey,
    model: settings.modelName,
    system: system || undefined,
    user,
    json: options.json,
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens ?? 1200,
    timeoutMs: TIMEOUT_MS,
  });

  if (!result.ok) {
    throw new Error(result.error === "NO_API_KEY" ? "AI anahtarı yapılandırılmamış." : `AI sağlayıcısı yanıt vermedi (${result.error}).`);
  }

  return result.text;
}

export function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(extractJsonObject(raw)) as T;
}

// ─── 1) Haber özeti: 3 madde + tek cümle ───────────────────────────────────

export type ArticleSummaryResult = {
  oneSentence: string;
  bullets: string[];
};

export async function summarizeArticle(input: {
  title: string;
  summary: string;
  body: string;
  category: string;
}): Promise<ArticleSummaryResult> {
  const raw = await complete({
    json: true,
    maxTokens: 600,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Bir haber editörüsün. Verilen haberi sadeleştirip özetle.
${SAFETY_RULES}

Şu JSON şemasında yanıt ver:
{"oneSentence": "haberi tek cümlede anlatan cümle", "bullets": ["madde 1", "madde 2", "madde 3"]}`,
      },
      {
        role: "user",
        content: `Kategori: ${input.category}
Başlık: ${input.title}
Spot: ${input.summary}
Metin: ${input.body.slice(0, 6000)}`,
      },
    ],
  });

  const parsed = parseJsonResponse<ArticleSummaryResult>(raw);

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.filter((item) => typeof item === "string").slice(0, 3)
    : [];

  return {
    oneSentence:
      typeof parsed.oneSentence === "string" ? parsed.oneSentence.trim() : "",
    bullets,
  };
}

// ─── 2) Kaynak karşılaştırma ───────────────────────────────────────────────

export type SourceComparisonRow = {
  name: string;
  emphasis: string;
  status: "common" | "different";
  confidence: number;
};

export type SourceComparisonResult = {
  common: string;
  differences: string;
  rows: SourceComparisonRow[];
};

export async function compareSources(input: {
  title: string;
  summary: string;
  sources: { name: string; headline: string }[];
}): Promise<SourceComparisonResult> {
  const raw = await complete({
    json: true,
    maxTokens: 900,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Aynı olayı işleyen kaynakları karşılaştırıyorsun.
${SAFETY_RULES}

Şu JSON şemasında yanıt ver:
{
  "common": "tüm kaynakların ortaklaştığı nokta (1-2 cümle)",
  "differences": "ayrışan noktalar (1-2 cümle)",
  "rows": [{"name":"kaynak adı","emphasis":"bu kaynağın öne çıkardığı nokta","status":"common|different","confidence":0-100}]
}`,
      },
      {
        role: "user",
        content: `Olay: ${input.title}
Özet: ${input.summary}

Kaynak başlıkları:
${input.sources
  .map((source, index) => `${index + 1}. ${source.name}: ${source.headline}`)
  .join("\n")}`,
      },
    ],
  });

  const parsed = parseJsonResponse<SourceComparisonResult>(raw);

  const rows = Array.isArray(parsed.rows)
    ? parsed.rows
        .filter((row) => row && typeof row.name === "string")
        .slice(0, 12)
        .map((row) => ({
          name: row.name,
          emphasis: typeof row.emphasis === "string" ? row.emphasis : "",
          status: (row.status === "different" ? "different" : "common") as "common" | "different",
          confidence:
            typeof row.confidence === "number"
              ? Math.max(0, Math.min(100, Math.round(row.confidence)))
              : 50,
        }))
    : [];

  return {
    common: typeof parsed.common === "string" ? parsed.common : "",
    differences:
      typeof parsed.differences === "string" ? parsed.differences : "",
    rows,
  };
}

// ─── 3) Günün brifingi ─────────────────────────────────────────────────────

export async function buildBriefing(input: {
  headlines: { title: string; summary: string }[];
}): Promise<{ items: string[]; closing: string }> {
  const raw = await complete({
    json: true,
    maxTokens: 700,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `Sabah brifingi hazırlıyorsun. Yalnızca verilen başlıklardan
5 maddelik kısa bir özet çıkar. Her madde tek cümle olsun.
${SAFETY_RULES}

Şu JSON şemasında yanıt ver:
{"items": ["madde 1","madde 2","madde 3","madde 4","madde 5"], "closing": "günün genel tonunu anlatan kısa cümle"}`,
      },
      {
        role: "user",
        content: input.headlines
          .map((item, index) => `${index + 1}. ${item.title} — ${item.summary}`)
          .join("\n"),
      },
    ],
  });

  const parsed = parseJsonResponse<{ items?: unknown; closing?: unknown }>(raw);

  return {
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((item): item is string => typeof item === "string")
          .slice(0, 5)
      : [],
    closing: typeof parsed.closing === "string" ? parsed.closing : "",
  };
}

// ─── 4) Sohbet (RAG) ───────────────────────────────────────────────────────

export type ChatSource = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
};

export async function answerWithContext(input: {
  question: string;
  history: AiMessage[];
  context: ChatSource[];
}): Promise<string> {
  const contextText = input.context
    .map(
      (item, index) =>
        `[${index + 1}] ${item.title}\nÖzet: ${item.summary}\nTarih: ${item.createdAt}`,
    )
    .join("\n\n");

  const history = input.history.slice(-6);

  return complete({
    maxTokens: 800,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `Sen TCFH News haber sitesinin asistanısın.
Yalnızca aşağıdaki sitede yayınlanmış haber bağlamına dayanarak yanıt ver.
Bağlamda yeterli bilgi yoksa aynen şunu söyle: "Bu konuda sitemizde içerik yok."
Yanıtı 4 cümleyi geçmeyecek şekilde kısa tut.
${SAFETY_RULES}

Bağlam:
${contextText || "(boş)"}`,
      },
      ...history,
      { role: "user", content: input.question },
    ],
  });
}
