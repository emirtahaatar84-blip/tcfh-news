"use client";

import { MoonIcon, SunIcon, SystemIcon } from "@/components/icons";
import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import type { ThemePreference } from "@/lib/local-store";

type Props = {
  labels: {
    system: string;
    light: string;
    dark: string;
  };
};

const ORDER: ThemePreference[] = ["system", "light", "dark"];

/**
 * Mobil üst çubuk için kompakt tema düğmesi: her dokunuşta
 * sistem → aydınlık → karanlık sırasıyla geçer.
 */
export function ThemeCycleButton({ labels }: Props) {
  const { prefs, setTheme } = useDevicePrefs();

  const next = ORDER[(ORDER.indexOf(prefs.theme) + 1) % ORDER.length];
  const currentLabel =
    prefs.theme === "system"
      ? labels.system
      : prefs.theme === "light"
        ? labels.light
        : labels.dark;

  const Icon =
    prefs.theme === "system"
      ? SystemIcon
      : prefs.theme === "light"
        ? SunIcon
        : MoonIcon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${currentLabel} — değiştir`}
      title={currentLabel}
      className="flex h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
