"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderIcon } from "@/components/icons";
import type { Dictionary } from "@/lib/i18n";

type Props = {
  initialSiteName: string;
  dict: Dictionary["admin"]["general"];
};

export function GeneralSettingsForm({ initialSiteName, dict }: Props) {
  const router = useRouter();
  const [siteName, setSiteName] = useState(initialSiteName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName }),
      });

      if (!response.ok) throw new Error("Save failed");

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
          <label htmlFor="site-name" className="field-label">
            {dict.siteName}
          </label>
          <input
            id="site-name"
            name="siteName"
            type="text"
            required
            maxLength={80}
            value={siteName}
            onChange={(event) => setSiteName(event.target.value)}
            placeholder={dict.siteNamePlaceholder}
            className="field"
          />
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
