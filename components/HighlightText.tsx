"use client";

import { useMemo } from "react";

type Props = {
  text: string;
  query: string | null;
  className?: string;
};

/**
 * Arama sorgusuyla eşleşen parçaları <mark> ile vurgular.
 * Türkçe diyakritikler katlanarak karşılaştırılır ("agac" → "Ağaç").
 * Vurgu, ekran okuyucular için anlam taşımaz; yalnızca görsel ipucudur.
 */

const FOLD_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
};

function foldCharacter(char: string): string {
  return (FOLD_MAP[char] ?? char).toLowerCase();
}

/** Uzunluk korunur: her karakter tek karaktere katlanır. */
function fold(value: string): string {
  let out = "";
  for (const char of value) out += foldCharacter(char);
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText({ text, query, className }: Props) {
  const segments = useMemo(() => {
    const needle = query?.trim() ?? "";
    if (needle.length < 2) return null;

    const foldedText = fold(text);
    const foldedNeedle = fold(needle);

    if (!foldedText.includes(foldedNeedle)) return null;

    const parts: { text: string; match: boolean }[] = [];
    let cursor = 0;

    // Uzunluk korunduğu için katlanmış metindeki indeksler orijinaline eşittir.
    while (cursor < text.length) {
      const index = foldedText.indexOf(foldedNeedle, cursor);

      if (index === -1) {
        parts.push({ text: text.slice(cursor), match: false });
        break;
      }

      if (index > cursor) {
        parts.push({ text: text.slice(cursor, index), match: false });
      }

      parts.push({
        text: text.slice(index, index + foldedNeedle.length),
        match: true,
      });
      cursor = index + foldedNeedle.length;
    }

    return parts;
  }, [query, text]);

  if (!segments) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-sm bg-blue-500/25 px-space-1 text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

/** Aynı katlama mantığını dışa aç (API/sunucu tarafı yardımcıları için). */
export { fold as foldForSearch, escapeRegExp };
