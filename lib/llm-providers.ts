/**
 * Çoklu LLM sağlayıcı katmanı — açık kaynak kurulumlar için.
 *
 * Desteklenen sağlayıcılar:
 *   openai      → OpenAI (gpt-4o, gpt-4.1 …)
 *   anthropic   → Anthropic Claude (messages API)
 *   gemini      → Google Gemini (generateContent)
 *   deepseek    → DeepSeek (OpenAI uyumlu)
 *   openrouter  → OpenRouter (OpenAI uyumlu, yüzlerce model)
 *   groq        → Groq (OpenAI uyumlu, hızlı)
 *   mistral     → Mistral (OpenAI uyumlu)
 *   ollama      → Yerel Ollama (OpenAI uyumlu, anahtar gerekmez)
 *   openai-compatible → Herhangi bir OpenAI uyumlu uç
 *
 * Tasarım: tek arayüz `callLlm()`; her sağlayıcı kendi istek/yanıt biçimine
 * uyarlanır. Anahtar YALNIZCA sunucuda (env veya DB) tutulur, istemciye asla
 * gönderilmez.
 */

export type LlmProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "groq"
  | "mistral"
  | "ollama"
  | "openai-compatible";

export type LlmProviderPreset = {
  id: LlmProviderId;
  label: string;
  /** Varsayılan base URL (kullanıcı panelden değiştirebilir). */
  baseUrl: string;
  /** Varsayılan model. */
  defaultModel: string;
  /** OpenAI uyumlu /chat/completions kullanır mı. */
  openAiCompatible: boolean;
  /** Anahtar zorunlu mu (ollama için değil). */
  requiresKey: boolean;
  docsUrl: string;
};

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderPreset> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "https://platform.openai.com/docs",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    openAiCompatible: false,
    requiresKey: true,
    docsUrl: "https://docs.anthropic.com",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    openAiCompatible: false,
    requiresKey: true,
    docsUrl: "https://ai.google.dev/docs",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "https://platform.deepseek.com/docs",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "https://openrouter.ai/docs",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "https://console.groq.com/docs",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "https://docs.mistral.ai",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (yerel)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    openAiCompatible: true,
    requiresKey: false,
    docsUrl: "https://ollama.com",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI uyumlu (özel)",
    baseUrl: "https://api.example.com/v1",
    defaultModel: "model-name",
    openAiCompatible: true,
    requiresKey: true,
    docsUrl: "",
  },
};

export type LlmCallInput = {
  provider: LlmProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  /** JSON yanıt iste (destekleyen sağlayıcılarda). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Dil modeline ek üstbilgiler (ör. OpenRouter HTTP-Referer). */
  extraHeaders?: Record<string, string>;
};

export type LlmCallResult =
  | { ok: true; text: string; raw: unknown }
  | { ok: false; error: string; status?: number };

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBase(provider: LlmProviderId, baseUrl?: string): string {
  const preset = LLM_PROVIDERS[provider];
  const base = trimSlash((baseUrl && baseUrl.trim()) || preset.baseUrl);
  // Kullanıcı "/v1" olmadan girerse ekle (OpenAI uyumlu uçlar için).
  if (preset.openAiCompatible && !/\/v\d+$/.test(base) && provider !== "ollama") {
    return `${base}/v1`;
  }
  return base;
}

/**
 * TEK GİRİŞ NOKTASI. Sağlayıcıdan bağımsız metin döndürür.
 */
export async function callLlm(input: LlmCallInput): Promise<LlmCallResult> {
  const preset = LLM_PROVIDERS[input.provider];
  if (!preset) return { ok: false, error: `Bilinmeyen sağlayıcı: ${input.provider}` };

  if (preset.requiresKey && !input.apiKey.trim()) {
    return { ok: false, error: "NO_API_KEY" };
  }

  const base = normalizeBase(input.provider, input.baseUrl);
  const timeout = input.timeoutMs ?? 60_000;
  const maxTokens = input.maxTokens ?? 4096;
  const temperature = input.temperature ?? 0.2;

  try {
    if (input.provider === "anthropic") {
      return await callAnthropic({ base, timeout, maxTokens, temperature, input });
    }
    if (input.provider === "gemini") {
      return await callGemini({ base, timeout, maxTokens, temperature, input });
    }
    return await callOpenAiCompatible({ base, timeout, maxTokens, temperature, input });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message.includes("timeout") || message.includes("abort")
        ? "TIMEOUT"
        : message.slice(0, 200),
    };
  }
}

// ─── OpenAI uyumlu (OpenAI, DeepSeek, OpenRouter, Groq, Mistral, Ollama) ─────

async function callOpenAiCompatible(args: {
  base: string;
  timeout: number;
  maxTokens: number;
  temperature: number;
  input: LlmCallInput;
}): Promise<LlmCallResult> {
  const { base, timeout, maxTokens, temperature, input } = args;

  const messages: { role: string; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.user });

  const body: Record<string, unknown> = {
    model: input.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (input.json) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(input.extraHeaders ?? {}),
  };

  // Ollama anahtar istemez; diğerleri Bearer kullanır.
  if (input.apiKey.trim()) headers.Authorization = `Bearer ${input.apiKey}`;

  // OpenRouter önerisi: kaynak tanıtımı.
  if (input.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.SITE_URL ?? "http://localhost:3000";
    headers["X-Title"] = "TCFH News";
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    return { ok: false, error: `HTTP ${response.status}: ${details}`, status: response.status };
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) return { ok: false, error: "EMPTY_RESPONSE" };

  return { ok: true, text, raw: payload };
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

async function callAnthropic(args: {
  base: string;
  timeout: number;
  maxTokens: number;
  temperature: number;
  input: LlmCallInput;
}): Promise<LlmCallResult> {
  const { base, timeout, maxTokens, temperature, input } = args;

  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: input.user }],
  };
  if (input.system) body.system = input.system;

  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    return { ok: false, error: `HTTP ${response.status}: ${details}`, status: response.status };
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (!text.trim()) return { ok: false, error: "EMPTY_RESPONSE" };

  return { ok: true, text, raw: payload };
}

// ─── Google Gemini ──────────────────────────────────────────────────────────

async function callGemini(args: {
  base: string;
  timeout: number;
  maxTokens: number;
  temperature: number;
  input: LlmCallInput;
}): Promise<LlmCallResult> {
  const { base, timeout, maxTokens, temperature, input } = args;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(input.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (input.system) {
    body.systemInstruction = { parts: [{ text: input.system }] };
  }

  const url = `${base}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    return { ok: false, error: `HTTP ${response.status}: ${details}`, status: response.status };
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");

  if (!text.trim()) return { ok: false, error: "EMPTY_RESPONSE" };

  return { ok: true, text, raw: payload };
}

/** Panel için güvenli sağlayıcı listesi (anahtar YOK). */
export function publicProviderList(): LlmProviderPreset[] {
  return Object.values(LLM_PROVIDERS);
}
