"use client";

import { MinusIcon, PlusIcon, TextAlignIcon } from "@/components/icons";
import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import type {
  FontSizePreference,
  LineHeightPreference,
} from "@/lib/local-store";

type Props = {
  labels: {
    title: string;
    fontSmall: string;
    fontLarge: string;
    lineTight: string;
    lineNormal: string;
    lineWide: string;
    readingMode: string;
    readingModeOn: string;
    readingModeOff: string;
    deviceOnly: string;
  };
};

const SIZES: FontSizePreference[] = ["sm", "md", "lg"];
const LINE_HEIGHTS: LineHeightPreference[] = ["tight", "normal", "wide"];

/**
 * Okuma araç çubuğu: yazı boyutu (3 kademe), satır aralığı (3 kademe) ve
 * sade okuma modu. Tercihler cihazda saklanır; sunucuya gönderilmez.
 */
export function ReadingToolbar({ labels }: Props) {
  const { prefs, setFontSize, setLineHeight, setReadingMode } =
    useDevicePrefs();

  const sizeIndex = SIZES.indexOf(prefs.fontSize);
  const lineIndex = LINE_HEIGHTS.indexOf(prefs.lineHeight);

  return (
    <div
      role="toolbar"
      aria-label={labels.title}
      className="flex flex-wrap items-center gap-space-2 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-2"
    >
      <div className="flex items-center gap-space-1 rounded-full border border-[#22252a] bg-[#0e0f12] p-space-1">
        <button
          type="button"
          onClick={() => setFontSize(SIZES[Math.max(0, sizeIndex - 1)])}
          disabled={sizeIndex === 0}
          aria-label={labels.fontSmall}
          title={labels.fontSmall}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <span
          aria-live="polite"
          className="min-w-[38px] text-center text-[11px] font-bold text-zinc-300"
        >
          A{sizeIndex === 0 ? "−" : sizeIndex === 2 ? "+" : ""}
        </span>
        <button
          type="button"
          onClick={() => setFontSize(SIZES[Math.min(2, sizeIndex + 1)])}
          disabled={sizeIndex === 2}
          aria-label={labels.fontLarge}
          title={labels.fontLarge}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() =>
          setLineHeight(LINE_HEIGHTS[(lineIndex + 1) % LINE_HEIGHTS.length])
        }
        aria-label={labels.lineNormal}
        title={
          prefs.lineHeight === "tight"
            ? labels.lineTight
            : prefs.lineHeight === "wide"
              ? labels.lineWide
              : labels.lineNormal
        }
        className="flex h-9 items-center gap-space-2 rounded-full border border-[#22252a] bg-[#0e0f12] px-space-3 text-[11px] font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
      >
        <TextAlignIcon className="h-3.5 w-3.5" />
        {prefs.lineHeight === "tight"
          ? labels.lineTight
          : prefs.lineHeight === "wide"
            ? labels.lineWide
            : labels.lineNormal}
      </button>

      <button
        type="button"
        onClick={() => setReadingMode(!prefs.readingMode)}
        aria-pressed={prefs.readingMode}
        title={prefs.readingMode ? labels.readingModeOn : labels.readingModeOff}
        className={`flex h-9 items-center gap-space-2 rounded-full border px-space-3 text-[11px] font-semibold transition ${
          prefs.readingMode
            ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
            : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        }`}
      >
        {prefs.readingMode ? "✓" : null}
        {labels.readingMode}
      </button>

      <span className="ml-auto hidden text-[10px] text-zinc-600 sm:block">
        {labels.deviceOnly}
      </span>
    </div>
  );
}
