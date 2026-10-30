/**
 * Münazara format kuralları (11.4).
 *
 * Lise: 24 dakika / 6 aşama · Üniversite: 32 dakika / 7 aşama.
 * Her aşamada doldurulması zorunlu dört alan vardır:
 * iddia (claim), gerekçe (warrant), kanıt (evidence), etki (impact).
 */

import type { DebateLevel } from "@/lib/debate/config";

export type DebateSide = "government" | "opposition" | "jury";

export type DebateRequiredField = "claim" | "warrant" | "evidence" | "impact";

export type DebateStage = {
  id: string;
  index: number;
  label: string;
  /** Konuşmacı taraf */
  speaker: DebateSide;
  /** Süre (saniye) */
  seconds: number;
  /** "Kim konuşuyor" kısa etiket */
  speakerLabel: string;
  /** "Ne yapmalı" tek cümle */
  task: string;
  /** İstenen çıktı */
  output: string;
  /** Zorunlu alanlar */
  required: DebateRequiredField[];
};

export const REQUIRED_FIELD_LABELS: Record<DebateRequiredField, string> = {
  claim: "İddia",
  warrant: "Gerekçe",
  evidence: "Kanıt (kaynaklı)",
  impact: "Etki",
};

export const SIDE_LABELS: Record<DebateSide, string> = {
  government: "Hükümet",
  opposition: "Muhalefet",
  jury: "Jüri",
};

const REQUIRED: DebateRequiredField[] = [
  "claim",
  "warrant",
  "evidence",
  "impact",
];

const LISE_STAGES: DebateStage[] = [
  {
    id: "lise-gov-opening",
    index: 1,
    label: "Hükümet açılış",
    speaker: "government",
    seconds: 4 * 60,
    speakerLabel: "Hükümet 1. konuşmacı",
    task: "Motion'ı tanımla, tezini kur ve üç ana argümanı kanıtlarıyla aç.",
    output: "3 argüman + 1 kaynaklı kanıt",
    required: REQUIRED,
  },
  {
    id: "lise-opp-opening",
    index: 2,
    label: "Muhalefet açılış",
    speaker: "opposition",
    seconds: 4 * 60,
    speakerLabel: "Muhalefet 1. konuşmacı",
    task: "Hükümetin çerçevesini çürüt, karşı tezini kur ve üç argümanını kanıtla.",
    output: "Çürütme + 3 argüman + 1 kaynaklı kanıt",
    required: REQUIRED,
  },
  {
    id: "lise-crossfire",
    index: 3,
    label: "Serbest müzakere / çapraz sorgu",
    speaker: "government",
    seconds: 6 * 60,
    speakerLabel: "İki taraf (2 × 3 dk)",
    task: "Karşı tarafın kanıtlarını sıkıştır; her soruya kısa ve kanıtlı yanıt ver.",
    output: "En az 2 çürütme + 1 uzlaşmazlık noktası",
    required: REQUIRED,
  },
  {
    id: "lise-opp-close",
    index: 4,
    label: "Muhalefet kapanış",
    speaker: "opposition",
    seconds: 3 * 60,
    speakerLabel: "Muhalefet 2. konuşmacı",
    task: "Tartışmanın neden muhalefet lehine kapandığını iki argümanla özetle.",
    output: "2 kilit argüman + 1 karar ölçütü",
    required: REQUIRED,
  },
  {
    id: "lise-gov-close",
    index: 5,
    label: "Hükümet kapanış",
    speaker: "government",
    seconds: 3 * 60,
    speakerLabel: "Hükümet 2. konuşmacı",
    task: "Muhalefetin kapanışını çürüt ve kendi tezinin neden üstün olduğunu göster.",
    output: "2 kilit argüman + 1 çürütme",
    required: REQUIRED,
  },
  {
    id: "lise-jury",
    index: 6,
    label: "Jüri gerekçeli karar",
    speaker: "jury",
    seconds: 4 * 60,
    speakerLabel: "Jüri",
    task: "Hangi tarafın ispat yükünü taşıdığını gerekçelendirerek karar ver.",
    output: "Gerekçeli karar + 1 gelişim notu",
    required: ["claim", "warrant", "evidence", "impact"],
  },
];

const UNIVERSITE_STAGES: DebateStage[] = [
  {
    id: "uni-gov-opening",
    index: 1,
    label: "Hükümet açılış",
    speaker: "government",
    seconds: 5 * 60,
    speakerLabel: "Hükümet 1. konuşmacı",
    task: "Kuramsal çerçeveyi kur, motion'ı tanımla ve üç argümanı mekanizmayla açıkla.",
    output: "3 argüman + mekanizma + kaynaklı kanıt",
    required: REQUIRED,
  },
  {
    id: "uni-opp-opening",
    index: 2,
    label: "Muhalefet açılış",
    speaker: "opposition",
    seconds: 5 * 60,
    speakerLabel: "Muhalefet 1. konuşmacı",
    task: "Hükümetin varsayımlarını çürüt, alternatif çerçeve kur ve üç argümanı kanıtla.",
    output: "Çürütme + 3 argüman + alternatif çerçeve",
    required: REQUIRED,
  },
  {
    id: "uni-gov-second",
    index: 3,
    label: "Hükümet 2. konuşma",
    speaker: "government",
    seconds: 4 * 60,
    speakerLabel: "Hükümet 2. konuşmacı",
    task: "Muhalefetin çürütmelerini yanıtla; kanıtların güvenilirliğini savun.",
    output: "2 yanıt + 1 kanıt değerlendirmesi",
    required: REQUIRED,
  },
  {
    id: "uni-opp-second",
    index: 4,
    label: "Muhalefet 2. konuşma",
    speaker: "opposition",
    seconds: 4 * 60,
    speakerLabel: "Muhalefet 2. konuşmacı",
    task: "Hükümetin yanıtlarını sıkıştır; ispat yükünün karşılanmadığını göster.",
    output: "2 sıkıştırma + 1 ispat yükü itirazı",
    required: REQUIRED,
  },
  {
    id: "uni-crossfire",
    index: 5,
    label: "Serbest müzakere",
    speaker: "government",
    seconds: 6 * 60,
    speakerLabel: "İki taraf",
    task: "Karşı tarafın en güçlü kanıtını hedef al; uzlaşmazlığı netleştir.",
    output: "En az 3 çürütme + 1 uzlaşmazlık özeti",
    required: REQUIRED,
  },
  {
    id: "uni-opp-close",
    index: 6,
    label: "Muhalefet kapanış",
    speaker: "opposition",
    seconds: 4 * 60,
    speakerLabel: "Muhalefet 3. konuşmacı",
    task: "Tartışmayı karar ölçütüne bağla ve muhalefetin neden kazandığını göster.",
    output: "Karar ölçütü + 2 kilit argüman",
    required: REQUIRED,
  },
  {
    id: "uni-gov-close",
    index: 7,
    label: "Hükümet kapanış",
    speaker: "government",
    seconds: 4 * 60,
    speakerLabel: "Hükümet 3. konuşmacı",
    task: "Kapanış çürütmesini yap ve hükümetin ispat yükünü karşıladığını göster.",
    output: "Kapanış çürütmesi + 2 kilit argüman",
    required: REQUIRED,
  },
];

export const DEBATE_FORMATS: Record<DebateLevel, DebateStage[]> = {
  lise: LISE_STAGES,
  universite: UNIVERSITE_STAGES,
  // Karma dosyalar lise formatıyla sunulur; not arayüzde açıkça yazılır.
  karma: LISE_STAGES,
};

export function stagesForLevel(level: DebateLevel): DebateStage[] {
  return DEBATE_FORMATS[level] ?? LISE_STAGES;
}

export function totalSeconds(stages: DebateStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.seconds, 0);
}

export function formatTotalMinutes(level: DebateLevel): number {
  return totalSeconds(stagesForLevel(level)) / 60;
}

/** "4 dk", "6 dk (2 × 3 dk)" gibi kısa süre etiketi. */
export function stageDurationLabel(stage: DebateStage): string {
  const minutes = Math.round(stage.seconds / 60);
  if (stage.id === "lise-crossfire") return `${minutes} dk (2 × 3 dk)`;
  return `${minutes} dk`;
}

/** "04:00" biçiminde geri sayım. */
export function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
