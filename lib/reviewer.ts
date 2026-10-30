import { z } from "zod";
import { getSettings } from "@/lib/settings";
import {
  extractJsonObject,
  resolveChatCompletionsUrl,
  truncate,
} from "@/lib/utils";

/**
 * Yayın öncesi denetçi — sentezlenen haber taslağını kaynak materyalle
 * karşılaştırır. Sentezden SONRA, NewsItem oluşturulmadan ÖNCE çağrılır
 * (lib/processor.ts). Model: qwen3-vl-30b (env REVIEWER_MODEL ile
 * ezilebilir). LLM çağrı deseni lib/x-studio.ts ile aynı:
 * `chat_template_kwargs: { enable_thinking: false }` ZORUNLU, timeout'lu
 * fetch, zod doğrulama.
 */

const REVIEWER_TIMEOUT_MS = 120_000;

const DEFAULT_REVIEWER_MODEL = "qwen3-vl-30b";

const REVIEWER_SYSTEM_PROMPT =
  "Sen bir yayın denetçisisin. ASLA haber yazmazsın. Sana verilen haber taslağını kaynak materyalle karşılaştır ve değerlendir: " +
  "(1) kaynakta olmayan uydurma bilgi var mı, (2) çarpıtma/abartma var mı, " +
  "(3) dil bilgisi ve anlaşılırlık, (4) tarafgirlik. " +
  'Yanıt: {"approved": boolean, "reason": "string"} — reason Türkçe, kısa; ' +
  "approved=true ise reason 'uygun' gibi kısa olmalı.";

const verdictSchema = z.object({
  approved: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((value) => value === true || value === "true"),
  reason: z.string().trim().min(1, "Gerekçe boş olamaz.").max(600, "Gerekçe çok uzun."),
});

export type ReviewVerdict = z.infer<typeof verdictSchema>;

export type ReviewStoryInput = {
  /** Taslağın başlığı. */
  title: string;
  /** Taslağın özeti. */
  summary: string;
  /** Taslağın detaylı içeriği (markdown). */
  content: string;
  /** Kümedeki kaynak makale başlıkları. */
  sourceTitles: string[];
  /** Kümedeki kaynak makalelerden kısa alıntılar. */
  sourceSnippets: string[];
};

function reviewerModel(): string {
  return process.env.REVIEWER_MODEL?.trim() || DEFAULT_REVIEWER_MODEL;
}

function renderUserPrompt(input: ReviewStoryInput): string {
  const sources = input.sourceTitles
    .map((title, index) => {
      const snippet = truncate(input.sourceSnippets[index] ?? "", 1_500);
      return `Kaynak #${index + 1}\nBaşlık: ${title}\nİçerik:\n${snippet}`;
    })
    .join("\n\n---\n\n");

  const today = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `BUGÜNÜN TARİHİ: ${today} (kendi eğitim bilgisindeki son tarihten sonraki olaylar tarih hatası sayılmaz)

HABER TASLAĞI (denetlenecek):
Başlık: ${input.title}
Özet: ${input.summary}
İçerik:
${truncate(input.content, 4_000)}

KAYNAK MATERYAL:
${sources}`;
}

/**
 * Taslağı denetler. Onaylanırsa {approved: true, reason: "uygun"} döner;
 * reddedilirse reason Türkçe kısa gerekçeyi taşır.
 *
 * Ağ/HTTP hatasında (ağ kesintisi, 5xx, zaman aşımı) fırlatır — çağıran
 * (processor) haberi pendingReview olarak bir sonraki döngüde tekrar
 * dener. Zod doğrulama hatası da fırlatılır (deterministik başarısızlık,
 * tekrar denenebilir).
 */
export async function reviewStory(input: ReviewStoryInput): Promise<ReviewVerdict> {
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
      model: reviewerModel(),
      messages: [
        { role: "system", content: REVIEWER_SYSTEM_PROMPT },
        { role: "user", content: renderUserPrompt(input) },
      ],
      // Denetçi model thinking modunda askıda kalabilir — kapatmak ZORUNLU.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(REVIEWER_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 200);
    throw new Error(`Denetçi LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const raw = payload.choices?.[0]?.message?.content;

  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Denetçi LLM yanıtı boş döndü.");
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("Denetçi yanıtı geçerli JSON değildi.");
  }

  const parsed = verdictSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `Denetçi çıktısı doğrulanamadı: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(kök)"}: ${issue.message}`)
        .join("; ")
        .slice(0, 300)}`,
    );
  }

  return parsed.data;
}
