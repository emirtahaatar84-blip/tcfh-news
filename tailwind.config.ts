import type { Config } from "tailwindcss";
import {
  sizingThemeEntries,
  spacingThemeEntries,
} from "./lib/design/tokens";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // 3 kolon yerleşim eşiği (WCAG/ürün gereksinimi: >= 1180 px)
        "3col": "1180px",
      },
      // Aralık: yalnızca token'lar (lib/design/tokens.ts → CSS değişkenleri).
      // Ham px veya ölçek dışı değer (p-3.5 gibi) derlenmez.
      spacing: spacingThemeEntries(),
      // Bileşen boyutları (ikon/avatar) ayrı ölçek: boşluk değil.
      width: sizingThemeEntries(),
      height: sizingThemeEntries(),
      minWidth: sizingThemeEntries(),
      minHeight: sizingThemeEntries(),
      maxWidth: { ...sizingThemeEntries(), measure: "var(--measure)" },
      maxHeight: sizingThemeEntries(),
      inset: sizingThemeEntries(),
      fontSize: {
        h1: ["var(--type-h1-size)", { lineHeight: "var(--type-h1-lh)", fontWeight: "600" }],
        h2: ["var(--type-h2-size)", { lineHeight: "var(--type-h2-lh)", fontWeight: "600" }],
        h3: ["var(--type-h3-size)", { lineHeight: "var(--type-h3-lh)", fontWeight: "600" }],
        body: [
          "var(--type-body-size)",
          { lineHeight: "var(--type-body-lh)", fontWeight: "400" },
        ],
        lead: [
          "var(--type-lead-size)",
          { lineHeight: "var(--type-lead-lh)", fontWeight: "400" },
        ],
        meta: [
          "var(--type-meta-size)",
          { lineHeight: "var(--type-meta-lh)", fontWeight: "400" },
        ],
        label: [
          "var(--type-label-size)",
          {
            lineHeight: "var(--type-label-lh)",
            fontWeight: "600",
            letterSpacing: "var(--type-label-tracking)",
          },
        ],
      },

      colors: {
        // TCFH News design tokens (Kantan.news / X style):
        // near-black base, dark gray panels and subtle gray borders.
        background: "#0e0f12",
        surface: "#16181c",
        "surface-alt": "#22252a",
        border: "#22252a",
        muted: "#a1a1aa", // zinc-400
        accent: "#3b82f6", // blue-500 (focus rings, links)
        "accent-strong": "#2563eb", // blue-600 (primary buttons)
        gold: "#facc15", // yellow-400 (category accents)
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.9" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
