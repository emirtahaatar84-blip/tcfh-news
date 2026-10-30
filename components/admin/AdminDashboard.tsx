"use client";

import { useState } from "react";
import Link from "next/link";
import { FetchPanel } from "@/components/admin/FetchPanel";
import { GeneralSettingsForm } from "@/components/admin/GeneralSettingsForm";
import { LlmSettingsForm } from "@/components/admin/LlmSettingsForm";
import { ModerationPanel } from "@/components/admin/ModerationPanel";
import { PodcastStudio } from "@/components/admin/PodcastStudio";
import { PortraitManager } from "@/components/admin/PortraitManager";
import { RssManager } from "@/components/admin/RssManager";
import { VideoNewsManager } from "@/components/admin/VideoNewsManager";
import {
  ArrowLeftIcon,
  ArticleIcon,
  ChevronRightIcon,
  MicIcon,
  PlayIcon,
  RssIcon,
  SettingsIcon,
  ShareIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  TrendingUpIcon,
  VideoIcon,
} from "@/components/icons";
import type { AdminSettingsDto } from "@/lib/admin-types";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import type { RssSourceDto } from "@/lib/rss-source";

type Tab =
  | "general"
  | "rss"
  | "llm"
  | "actions"
  | "video"
  | "podcast"
  | "portraits"
  | "moderation";

type Props = {
  lang: Locale;
  dict: Dictionary["admin"];
  portraits: Dictionary["portraits"];
  categoryLabels: Dictionary["categories"];
  backToFeed: string;
  settings: AdminSettingsDto;
  sources: RssSourceDto[];
  newsCount: number;
  activeSourceCount: number;
  /** Başlangıç sekmesi (?tab=rss gibi derin bağlantılar için). */
  initialTab?: string;
};

const VALID_TABS: readonly Tab[] = [
  "general",
  "rss",
  "llm",
  "actions",
  "video",
  "podcast",
  "portraits",
  "moderation",
];

export function AdminDashboard({
  lang,
  dict,
  portraits,
  categoryLabels,
  backToFeed,
  settings,
  sources,
  newsCount,
  activeSourceCount,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "general",
  );

  const tabs = [
    { id: "general" as const, label: dict.tabs.general, icon: SettingsIcon },
    { id: "rss" as const, label: dict.tabs.rss, icon: RssIcon },
    { id: "llm" as const, label: dict.tabs.llm, icon: SparklesIcon },
    { id: "actions" as const, label: dict.tabs.actions, icon: PlayIcon },
    { id: "video" as const, label: dict.videoNews.tab, icon: VideoIcon },
    { id: "podcast" as const, label: dict.podcast.tab, icon: MicIcon },
    { id: "portraits" as const, label: portraits.tabLabel, icon: SparklesIcon },
    {
      id: "moderation" as const,
      label: dict.moderation.tab,
      icon: ShieldCheckIcon,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-space-4 py-space-6 sm:px-space-5">
      <Link
        href={`/${lang}`}
        className="inline-flex items-center gap-space-2 text-xs font-semibold text-muted transition hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {backToFeed}
      </Link>

      <div className="mt-space-4 flex flex-wrap items-start justify-between gap-space-3">
        <div>
          <h1 className="t-h1 text-zinc-50">
            {dict.title}
          </h1>
          <p className="mt-space-1 max-w-xl text-sm leading-relaxed text-muted">
            {dict.subtitle}
          </p>
        </div>
        <span className="chip border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
          <ShieldIcon className="h-3.5 w-3.5" />
          {dict.secured}
        </span>
      </div>

      <div className="mt-space-5 grid grid-cols-3 gap-space-2 sm:gap-space-3">
        <div className="flex items-center gap-space-3 rounded-xl border border-border/70 bg-[#0e0f12] px-space-3 py-space-4 transition hover:border-[#31363e]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <ArticleIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight text-zinc-100">
              {newsCount}
            </p>
            <p className="truncate text-[11px] text-muted">
              {dict.stats.news}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-space-3 rounded-xl border border-border/70 bg-[#0e0f12] px-space-3 py-space-4 transition hover:border-[#31363e]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <RssIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight text-zinc-100">
              {sources.length}
            </p>
            <p className="truncate text-[11px] text-muted">
              {dict.stats.sources}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-space-3 rounded-xl border border-border/70 bg-[#0e0f12] px-space-3 py-space-4 transition hover:border-[#31363e]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <TrendingUpIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight text-zinc-100">
              {activeSourceCount}
            </p>
            <p className="truncate text-[11px] text-muted">
              {dict.stats.activeSources}
            </p>
          </div>
        </div>
      </div>

      {/* X Stüdyo kısayolu */}
      <Link
        href={`/${lang}/admin/x-studio`}
        className="group mt-space-3 flex items-center justify-between gap-space-3 rounded-xl border border-blue-500/25 bg-blue-500/10 px-space-4 py-space-3 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/15"
      >
        <span className="inline-flex items-center gap-space-2">
          <ShareIcon className="h-4 w-4" />
          {dict.xstudioLink}
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <nav
        aria-label={dict.title}
        className="mt-space-5 flex gap-space-1 overflow-x-auto rounded-xl border border-border/70 bg-[#0e0f12] p-space-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 shrink-0 items-center justify-center gap-space-2 rounded-lg px-space-3 py-space-3 text-xs font-semibold transition sm:text-sm ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-950/50"
                  : "text-muted hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-space-4">
        {tab === "general" ? (
          <GeneralSettingsForm
            initialSiteName={settings.siteName}
            dict={dict.general}
          />
        ) : null}

        {tab === "rss" ? (
          <RssManager
            initialSources={sources}
            dict={dict.rss}
            categoryLabels={categoryLabels}
          />
        ) : null}

        {tab === "llm" ? (
          <LlmSettingsForm settings={settings} dict={dict.llm} />
        ) : null}

        {tab === "actions" ? (
          <FetchPanel
            dict={dict.fetch}
            hasActiveSources={activeSourceCount > 0}
          />
        ) : null}

        {tab === "video" ? (
          <VideoNewsManager lang={lang} dict={dict.videoNews} />
        ) : null}

        {tab === "podcast" ? (
          <PodcastStudio lang={lang} dict={dict.podcast} />
        ) : null}

        {tab === "portraits" ? (
          <PortraitManager lang={lang} labels={portraits.admin} />
        ) : null}

        {tab === "moderation" ? (
          <ModerationPanel
            lang={lang}
            dict={dict.moderation}
            categoryLabels={categoryLabels}
            onNavigateTab={(next) => setTab(next)}
          />
        ) : null}
      </div>
    </div>
  );
}
