import { createHash } from "crypto";

export function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Accepts a base URL (https://api.openai.com/v1), a full endpoint, or a
 * provider root and resolves it to an OpenAI-compatible chat completions URL.
 */
export function resolveChatCompletionsUrl(providerUrl: string): string {
  let trimmed = providerUrl.trim().replace(/\/+$/, "");

  // Users often paste the models listing endpoint from provider docs.
  // The chat endpoint is the parent /v1 path, not /v1/models.
  trimmed = trimmed.replace(/\/models$/i, "").replace(/\/+$/, "");

  if (trimmed.endsWith("/chat/completions")) return trimmed;

  try {
    const path = new URL(trimmed).pathname.replace(/\/+$/, "");

    if (/\/v\d+[a-z0-9.-]*$/i.test(path) || path.includes("/v1/")) {
      return `${trimmed}/chat/completions`;
    }
  } catch {
    // Fall through to the default OpenAI-compatible path.
  }

  return `${trimmed}/v1/chat/completions`;
}

/** Removes the surrounding markdown fence that some models still return. */
export function extractJsonObject(raw: string): string {
  let value = raw.trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return value.slice(firstBrace, lastBrace + 1);
  }

  return value;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

const TR_CHAR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Folds Turkish diacritics to ASCII: "Ağacı" → "Agaci". */
export function foldTurkish(value: string): string {
  let out = "";

  for (const char of value) {
    out += TR_CHAR_MAP[char] ?? char;
  }

  return out;
}

/** Reading time in minutes for a piece of Turkish/English text (~200 wpm). */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Safely parses a JSON string column, returning the fallback on failure. */
export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string",
    );
  } catch {
    return [];
  }
}

/** Converts AI markdown into plain, TTS-friendly spoken text. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]+/g, " ")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
