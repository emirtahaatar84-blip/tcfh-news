/**
 * Yoğunluk yardımcıları — istemci ve sunucu tarafında ortak.
 * Değerler tek kaynaktan (lib/design/tokens.ts) türetilir.
 */

import { DENSITIES, DENSITY, type Density } from "@/lib/design/tokens";

export type { Density };

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as string[]).includes(value);
}

/** Yoğunluk etiketi (TR arayüz). */
export function densityLabel(density: Density): string {
  return DENSITY[density].label;
}
