"use client";

import { signIn } from "next-auth/react";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  label: string;
  notConfiguredNote?: string;
  disabled?: boolean;
  redirectTo?: string;
  className?: string;
};

/** Official-ish multicolor Google "G". */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.56-5.17 3.56-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.55.38-2.27V6.62H1.28a12 12 0 0 0 0 10.76l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4 3.11c.94-2.85 3.59-4.97 6.72-4.97Z"
      />
    </svg>
  );
}

/**
 * Single-click Google sign-in button. Rendered disabled with a hint when
 * OAuth credentials are not configured yet (GOOGLE_CLIENT_ID / SECRET).
 */
export function GoogleLoginButton({
  label,
  notConfiguredNote,
  disabled = false,
  redirectTo,
  className = "",
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        void signIn("google", { redirectTo: redirectTo ?? "/" });
      }}
      title={disabled ? notConfiguredNote : label}
      aria-label={label}
      className={`inline-flex w-full items-center justify-center gap-space-3 rounded-full border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-sm font-semibold text-zinc-100 transition hover:bg-[#1d2026] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <GoogleGlyph />
      <span className="truncate">{label}</span>
    </button>
  );
}
