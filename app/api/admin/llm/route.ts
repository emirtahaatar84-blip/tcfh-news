import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROMPT_TEMPLATE,
  getSettings,
  toSafeSettings,
} from "@/lib/settings";
import { isValidHttpUrl } from "@/lib/utils";
import { LLM_PROVIDERS, type LlmProviderId } from "@/lib/llm-providers";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const input = body as {
    llmProvider?: unknown;
    providerUrl?: unknown;
    apiKey?: unknown;
    modelName?: unknown;
    promptTemplate?: unknown;
    clearApiKey?: unknown;
  };

  const provider =
    typeof input.llmProvider === "string" && input.llmProvider in LLM_PROVIDERS
      ? input.llmProvider
      : "openai";

  // Sağlayıcı presetinin base URL'i/anahtar zorunluluğu.
  const preset = LLM_PROVIDERS[provider as LlmProviderId];

  const providerUrl =
    typeof input.providerUrl === "string" && input.providerUrl.trim()
      ? input.providerUrl.trim()
      : preset.baseUrl;
  const modelName =
    typeof input.modelName === "string" ? input.modelName.trim() : "";

  if (!isValidHttpUrl(providerUrl)) {
    return jsonError(
      "A valid provider URL is required.",
      400,
      "INVALID_PROVIDER_URL",
    );
  }

  if (!modelName || modelName.length > 120) {
    return jsonError(
      "A model name is required.",
      400,
      "INVALID_MODEL_NAME",
    );
  }

  const promptTemplate =
    typeof input.promptTemplate === "string" && input.promptTemplate.trim()
      ? input.promptTemplate.trim()
      : DEFAULT_PROMPT_TEMPLATE;

  await getSettings();

  const data: {
    llmProvider: string;
    providerUrl: string;
    modelName: string;
    promptTemplate: string;
    apiKey?: string;
  } = { llmProvider: provider, providerUrl, modelName, promptTemplate };

  if (input.clearApiKey === true) {
    data.apiKey = "";
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    data.apiKey = input.apiKey.trim();
  }

  const settings = await prisma.systemSettings.update({
    where: { id: 1 },
    data,
  });

  return NextResponse.json({ settings: toSafeSettings(settings) });
}

/**
 * GET /api/admin/llm — panelin göstereceği sağlayıcı listesi (anahtar YOK).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  return NextResponse.json(
    {
      providers: Object.values(LLM_PROVIDERS),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
