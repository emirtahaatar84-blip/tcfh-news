"use client";

import { useState } from "react";
import { LLM_PROVIDERS, type LlmProviderId } from "@/lib/llm-providers";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderIcon } from "@/components/icons";
import type { AdminSettingsDto } from "@/lib/admin-types";
import type { Dictionary } from "@/lib/i18n";

type Props = {
  settings: AdminSettingsDto;
  dict: Dictionary["admin"]["llm"];
};

export function LlmSettingsForm({ settings, dict }: Props) {
  const router = useRouter();
  const [llmProvider, setLlmProvider] = useState<string>(
    settings.llmProvider ?? "openai",
  );
  const [providerUrl, setProviderUrl] = useState(settings.providerUrl);
  const [modelName, setModelName] = useState(settings.modelName);
  const [promptTemplate, setPromptTemplate] = useState(
    settings.promptTemplate,
  );
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(settings.hasApiKey);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  /** Sağlayıcı değişince base URL ve modeli presetten doldur. */
  const onProviderChange = (id: string) => {
    setLlmProvider(id);
    const preset = LLM_PROVIDERS[id as LlmProviderId];
    if (preset) {
      setProviderUrl(preset.baseUrl);
      setModelName(preset.defaultModel);
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/admin/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider,
          providerUrl,
          modelName,
          promptTemplate,
          apiKey,
          clearApiKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        settings?: AdminSettingsDto;
      };

      if (!response.ok || !data.settings) throw new Error("Save failed");

      setHasApiKey(data.settings.hasApiKey);
      setApiKey("");
      setClearApiKey(false);
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-card">
      <h2 className="text-lg font-bold text-zinc-50">{dict.title}</h2>
      <p className="mt-space-1 text-sm leading-relaxed text-muted">
        {dict.description}
      </p>

      <form onSubmit={handleSubmit} className="mt-space-5 space-y-space-4">
        <div>
          <label htmlFor="provider-url" className="field-label">
            {dict.providerUrl}
          </label>
          <input
            id="provider-url"
            type="url"
            required
            value={providerUrl}
            onChange={(event) => setProviderUrl(event.target.value)}
            placeholder={dict.providerUrlPlaceholder}
            className="field"
          />
          <p className="mt-space-2 text-xs text-muted">
            {dict.providerUrlHint}
          </p>
        </div>

        <div className="grid gap-space-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model-name" className="field-label">
              {dict.modelName}
            </label>
            <input
              id="model-name"
              type="text"
              required
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              placeholder={dict.modelNamePlaceholder}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="api-key" className="field-label">
              <div className="mb-space-3">
              <label htmlFor="llm-provider" className="field-label">
                Sağlayıcı
              </label>
              <select
                id="llm-provider"
                value={llmProvider}
                onChange={(event) => onProviderChange(event.target.value)}
                className="field cursor-pointer [&>option]:bg-[#0e0f12]"
              >
                {Object.values(LLM_PROVIDERS).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <p className="mt-space-2 text-xs text-muted">
                OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter,
                Groq, Mistral veya yerel Ollama. Anahtar yalnızca sunucuda saklanır.
              </p>
            </div>

            {dict.apiKey}
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (event.target.value) setClearApiKey(false);
              }}
              placeholder={dict.apiKeyPlaceholder}
              className="field"
            />
            <p className="mt-space-2 text-xs text-muted">
              {hasApiKey
                ? `${dict.apiKeyPresent} ${dict.apiKeyHint}`
                : dict.apiKeyHint}
            </p>
          </div>
        </div>

        {hasApiKey ? (
          <label className="flex cursor-pointer items-center gap-space-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(event) => {
                setClearApiKey(event.target.checked);
                if (event.target.checked) setApiKey("");
              }}
              className="h-4 w-4 rounded border-border bg-[#0e0f12] accent-sky-500"
            />
            {dict.clearApiKey}
          </label>
        ) : null}

        <div>
          <label htmlFor="prompt-template" className="field-label">
            {dict.promptTemplate}
          </label>
          <textarea
            id="prompt-template"
            rows={12}
            value={promptTemplate}
            onChange={(event) => setPromptTemplate(event.target.value)}
            spellCheck={false}
            className="field resize-y font-mono text-[13px] leading-relaxed"
          />
          <p className="mt-space-2 text-xs text-muted">{dict.promptHint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-space-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <LoaderIcon className="h-4 w-4 animate-spin" />
            ) : null}
            {saving ? dict.saving : dict.save}
          </button>

          <span aria-live="polite" className="text-sm">
            {status === "saved" ? (
              <span className="inline-flex items-center gap-space-2 text-emerald-400">
                <CheckIcon className="h-4 w-4" />
                {dict.saved}
              </span>
            ) : null}
            {status === "error" ? (
              <span className="text-rose-400">{dict.error}</span>
            ) : null}
          </span>
        </div>
      </form>
    </section>
  );
}
