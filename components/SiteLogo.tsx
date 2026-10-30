import type { ReactNode } from "react";

/**
 * Splits a site name into base + suffix so the TLD part can be tinted.
 * "news.example.com" → ["news", ".example", ".com"]
 * "example.com" → ["example", ".com"]
 */
export function splitSiteName(name: string): [string, string] {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return [name, ""];

  const parts = name.split(".");
  // Compound TLD such as ".com.tr" / ".co.uk": tint the last two segments.
  if (
    parts.length >= 3 &&
    parts[parts.length - 1].length <= 3 &&
    parts[parts.length - 2].length <= 4
  ) {
    const cut = name.lastIndexOf(".", index - 1);
    if (cut > 0) return [name.slice(0, cut), name.slice(cut)];
  }

  return [name.slice(0, index), name.slice(index)];
}

/**
 * Dynamic site-name logo, editable from Admin → General Settings.
 * The text after the last dot is rendered in the accent blue.
 */
export function SiteLogo({
  siteName,
  className = "",
}: {
  siteName: string;
  className?: string;
}) {
  const [base, suffix] = splitSiteName(siteName);

  let content: ReactNode = siteName;
  if (suffix) {
    content = (
      <>
        {base}
        <span className="text-blue-500">{suffix}</span>
      </>
    );
  }

  return (
    <span className={`truncate font-bold tracking-tight text-zinc-100 ${className}`}>
      {content}
    </span>
  );
}
