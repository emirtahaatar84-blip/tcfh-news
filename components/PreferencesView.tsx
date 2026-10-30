"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookmarkFilledIcon,
  CheckIcon,
  MoonIcon,
  SunIcon,
  SystemIcon,
  TrashIcon,
} from "@/components/icons";
import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import { DensityControl } from "@/components/settings/DensityControl";
import {
  clearAllDeviceData,
  clearReadMarks,
  isStorageAvailable,
  type FontSizePreference,
  type LineHeightPreference,
} from "@/lib/local-store";
import type { Locale } from "@/lib/i18n-config";

type Labels = {
  title: string;
  subtitle: string;
  theme: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  fontSize: string;
  fontSmall: string;
  fontMedium: string;
  fontLarge: string;
  fontSizeDecrease: string;
  fontSizeIncrease: string;
  fontSizeLevel: string;
  density: string;
  densityGroup: string;
  densityHint: string;
  densityCompactHint: string;
  densityBalancedHint: string;
  densityComfortableHint: string;
  densityAuto: string;
  densityAutoHint: string;
  densityResetAuto: string;
  lineHeight: string;
  lineTight: string;
  lineNormal: string;
  lineWide: string;
  readingMode: string;
  readingModeHint: string;
  dyslexicFont: string;
  dyslexicFontHint: string;
  readMarks: string;
  readMarksHint: string;
  autoRead: string;
  autoReadHint: string;
  library: string;
  libraryHint: string;
  clearRead: string;
  clearAll: string;
  clearAllHint: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
  deviceOnly: string;
  unavailable: string;
  done: string;
};

const SIZES: FontSizePreference[] = ["sm", "md", "lg"];
const LINES: LineHeightPreference[] = ["tight", "normal", "wide"];

/**
 * Cihaz tercihleri sayfası — hesap yok, giriş yok. Tüm ayarlar yalnızca
 * bu cihazda saklanır ve tek tıkla silinebilir.
 */
export function PreferencesView({ lang, labels }: { lang: Locale; labels: Labels }) {
  const {
    prefs,
    setTheme,
    setFontSize,
    setLineHeight,
    setReadingMode,
    setReadMarks,
    setAutoRead,
    setFont,
  } = useDevicePrefs();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageOk] = useState(() => isStorageAvailable());

  function announce(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  return (
    <div className="page-x mx-auto max-w-[var(--layout-max)] pb-space-8 pt-space-4">
      <h1 className="t-h1 text-zinc-100">{labels.title}</h1>
      <p className="mt-space-1 t-meta leading-relaxed text-zinc-500">
        {labels.subtitle}
      </p>

      <p className="mt-space-3 inline-flex items-center gap-space-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-3.5 py-space-1 text-[10px] font-semibold text-emerald-500">
        <CheckIcon className="h-3 w-3" />
        {labels.deviceOnly}
      </p>

      {!storageOk ? (
        <p
          role="status"
          className="mt-space-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-space-3 py-space-2 t-meta text-amber-300"
        >
          {labels.unavailable}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-space-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-space-3 py-space-2 t-meta text-emerald-300"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-space-5 flex flex-col gap-card-gap">
        <section className="surface-card">
          <h2 className="t-meta font-bold text-zinc-200">{labels.theme}</h2>
          <div className="mt-space-2 grid grid-cols-3 gap-space-2">
            {(
              [
                ["system", labels.themeSystem, SystemIcon],
                ["light", labels.themeLight, SunIcon],
                ["dark", labels.themeDark, MoonIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={prefs.theme === value}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-space-1 rounded-xl border text-[10px] font-semibold transition ${
                  prefs.theme === value
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                    : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="surface-card">
          <h2 className="t-meta font-bold text-zinc-200">{labels.fontSize}</h2>
          <div className="mt-space-2 flex items-center gap-space-2">
            <button
              type="button"
              aria-label={labels.fontSizeDecrease}
              disabled={prefs.fontSize === SIZES[0]}
              onClick={() => {
                const index = SIZES.indexOf(prefs.fontSize);
                if (index > 0) setFontSize(SIZES[index - 1]);
              }}
              className="flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-xl border border-[#22252a] text-body font-bold text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              A−
            </button>

            <div className="grid min-w-0 flex-1 grid-cols-3 gap-space-2">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  aria-pressed={prefs.fontSize === size}
                  className={`min-h-[var(--size-touch)] rounded-xl border text-meta font-bold transition ${
                    prefs.fontSize === size
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {size === "sm"
                    ? labels.fontSmall
                    : size === "md"
                      ? labels.fontMedium
                      : labels.fontLarge}
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label={labels.fontSizeIncrease}
              disabled={prefs.fontSize === SIZES[SIZES.length - 1]}
              onClick={() => {
                const index = SIZES.indexOf(prefs.fontSize);
                if (index < SIZES.length - 1) setFontSize(SIZES[index + 1]);
              }}
              className="flex h-[var(--size-touch)] w-[var(--size-touch)] shrink-0 items-center justify-center rounded-xl border border-[#22252a] text-body font-bold text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              A+
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {labels.fontSizeLevel
              .replace("{level}", String(SIZES.indexOf(prefs.fontSize) + 1))
              .replace("{total}", String(SIZES.length))}
          </p>

          <h2 className="mt-space-4 t-meta font-bold text-zinc-200">
            {labels.lineHeight}
          </h2>
          <div className="mt-space-2 grid grid-cols-3 gap-space-2">
            {LINES.map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => setLineHeight(line)}
                aria-pressed={prefs.lineHeight === line}
                className={`min-h-[44px] rounded-xl border t-meta font-semibold transition ${
                  prefs.lineHeight === line
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                    : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {line === "tight"
                  ? labels.lineTight
                  : line === "normal"
                    ? labels.lineNormal
                    : labels.lineWide}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-space-2 surface-card">
          <label className="flex min-h-[var(--size-touch)] cursor-pointer items-start gap-space-3">
            <input
              type="checkbox"
              checked={prefs.readingMode}
              onChange={(event) => setReadingMode(event.target.checked)}
              className="mt-title-spot h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block t-meta font-semibold text-zinc-200">
                {labels.readingMode}
              </span>
              <span className="block text-label text-zinc-500">
                {labels.readingModeHint}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-space-3 border-t border-[#22252a] pt-spot-meta">
            <input
              type="checkbox"
              checked={prefs.font === "dyslexic"}
              onChange={(event) =>
                setFont(event.target.checked ? "dyslexic" : "default")
              }
              className="mt-title-spot h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block t-meta font-semibold text-zinc-200">
                {labels.dyslexicFont}
              </span>
              <span className="block text-label text-zinc-500">
                {labels.dyslexicFontHint}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-space-3 border-t border-[#22252a] pt-spot-meta">
            <input
              type="checkbox"
              checked={prefs.readMarks}
              onChange={(event) => setReadMarks(event.target.checked)}
              className="mt-title-spot h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block t-meta font-semibold text-zinc-200">
                {labels.readMarks}
              </span>
              <span className="block text-label text-zinc-500">
                {labels.readMarksHint}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-space-3 border-t border-[#22252a] pt-spot-meta">
            <input
              type="checkbox"
              checked={prefs.autoRead}
              onChange={(event) => setAutoRead(event.target.checked)}
              className="mt-title-spot h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block t-meta font-semibold text-zinc-200">
                {labels.autoRead}
              </span>
              <span className="block text-label text-zinc-500">
                {labels.autoReadHint}
              </span>
            </span>
          </label>
        </section>

        <section className="surface-card">
          <DensityControl
            label={labels.density}
            groupLabel={labels.densityGroup}
            hints={{
              compact: labels.densityCompactHint,
              balanced: labels.densityBalancedHint,
              comfortable: labels.densityComfortableHint,
            }}
            autoLabel={labels.densityAuto}
            resetLabel={labels.densityResetAuto}
          />
          <p className="mt-space-2 text-label text-zinc-500">
            {labels.densityHint} {labels.densityAutoHint}
          </p>
        </section>

        <Link
          href={`/${lang}/bookmarks`}
          className="flex items-center gap-space-3 surface-card transition hover:border-[#31363e]"
        >
          <span className="flex h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <BookmarkFilledIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block t-meta font-semibold text-zinc-200">
              {labels.library}
            </span>
            <span className="block text-label text-zinc-500">
              {labels.libraryHint}
            </span>
          </span>
        </Link>

        <section className="surface-card">
          <h2 className="t-meta font-bold text-zinc-200">{labels.clearAll}</h2>
          <p className="mt-space-1 text-label text-zinc-500">
            {labels.clearAllHint}
          </p>

          <div className="mt-spot-meta flex flex-wrap gap-space-2">
            <button
              type="button"
              onClick={() => {
                clearReadMarks();
                announce(labels.done);
              }}
              className="min-h-[var(--size-touch)] rounded-full border border-[#22252a] px-space-3 py-space-2 text-meta font-semibold text-zinc-400 transition hover:text-zinc-100"
            >
              {labels.clearRead}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-space-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-space-3 py-space-2 text-[11px] font-semibold text-rose-400 transition hover:bg-rose-500/20"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {labels.clearAll}
            </button>
          </div>
        </section>
      </div>

      {confirmOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="device-clear-title"
          className="fixed inset-0 z-[70] flex items-center justify-center px-space-4"
        >
          <button
            type="button"
            aria-label={labels.confirmNo}
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            tabIndex={-1}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-[#22252a] bg-[#16181c] p-space-5 shadow-2xl">
            <h2 id="device-clear-title" className="text-base font-bold text-zinc-100">
              {labels.confirmTitle}
            </h2>
            <p className="mt-space-2 t-lead leading-relaxed text-zinc-400">
              {labels.confirmBody}
            </p>
            <div className="mt-space-5 flex gap-inline">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary flex-1"
              >
                {labels.confirmNo}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  void clearAllDeviceData().then(() => {
                    announce(labels.done);
                    window.setTimeout(() => window.location.reload(), 600);
                  });
                }}
                className="inline-flex flex-1 items-center justify-center gap-space-2 rounded-full bg-rose-600 px-space-4 py-space-2 t-lead font-bold text-white transition hover:bg-rose-500"
              >
                <TrashIcon className="h-4 w-4" />
                {labels.confirmYes}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
