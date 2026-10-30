/**
 * TEK KAYNAK: aralık (spacing), tipografi ve yoğunluk (density) belirteçleri.
 *
 * Bu dosya dışında hiçbir bileşen ham px değeri kullanmaz. Bileşenler
 * semantik Tailwind anahtarlarını (`p-card-y`, `gap-card-gap`,
 * `space-y-section-gap`) veya ölçek anahtarlarını (`gap-space-4`) kullanır.
 *
 * Üretim: `node scripts/generate-tokens.mjs` → `app/generated/tokens.css`
 * (`prebuild`/`predev` adımında otomatik). `tests/tokens.test.ts` dosyanın
 * kaynakla aynı olduğunu doğrular.
 */

/** 8 pt tabanlı ölçek. Yalnızca bu 11 değer kullanılabilir. */
export const SPACE_SCALE = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 128,
} as const;

export type SpaceStep = keyof typeof SPACE_SCALE;

export const SPACE_STEPS: SpaceStep[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Yoğunluk çarpanları. Çarpan, ölçek basamağını kaydırır:
 * 1.00 → +0, 1.25 → +1, 1.50 → +2. Yeni değer uydurulmaz.
 */
export const DENSITY = {
  compact: { multiplier: 1.0, offset: 0, label: "Sıkı" },
  balanced: { multiplier: 1.25, offset: 1, label: "Dengeli" },
  comfortable: { multiplier: 1.5, offset: 2, label: "Geniş" },
} as const;

export type Density = keyof typeof DENSITY;
export type DensityPreference = Density | "auto";

export const DENSITIES: Density[] = ["compact", "balanced", "comfortable"];

/**
 * Semantik aralık rolleri.
 *
 * `step`: Sıkı moddaki ölçek basamağı. Yoğunluk arttıkça basamak yükselir;
 * böylece istenen örnek tablo birebir çıkar:
 *   kart içi 12/16/24 · kartlar arası 16/24/32 · bölümler 32/48/64.
 * `scales: false` → ilişki tipi her yerde aynı kalır (başlık→spot 8 gibi).
 */
export const SPACING_ROLES = {
  cardY: { step: 3, scales: true },
  cardX: { step: 3, scales: true },
  cardGap: { step: 4, scales: true },
  sectionGap: { step: 6, scales: true },
  titleBody: { step: 2, scales: true },
  titleSpot: { step: 2, scales: false },
  spotMeta: { step: 3, scales: false },
  inline: { step: 2, scales: false },
  /** Orta kolon içi dikey akış (şerit → akış) */
  topGap: { step: 5, scales: true },
  /** İçerik blokları arası (ana sayfa blokları) */
  blockGap: { step: 6, scales: true },
  columnGap: { step: 5, scales: true },
  blockBreath: { step: 2, scales: true },
  bottomNavGap: { step: 5, scales: false },
} as const;

export type SpacingRole = keyof typeof SPACING_ROLES;

/** Değeri en yakın izin verilen ölçek basamağına oturtur. */
export function snapToScale(value: number): number {
  let best: number = SPACE_SCALE[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const step of SPACE_STEPS) {
    const candidate = SPACE_SCALE[step];
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/** Rol + yoğunluk → izin verilen ölçek değeri (px). */
export function resolveRole(role: SpacingRole, density: Density): number {
  const config = SPACING_ROLES[role];
  const offset = config.scales ? DENSITY[density].offset : 0;
  const step = Math.min(10, Math.max(0, config.step + offset)) as SpaceStep;
  return SPACE_SCALE[step];
}

/** Tüm semantik rolleri bir yoğunluk için çözer. */
export function resolveAll(density: Density): Record<SpacingRole, number> {
  const result = {} as Record<SpacingRole, number>;
  for (const role of Object.keys(SPACING_ROLES) as SpacingRole[]) {
    result[role] = resolveRole(role, density);
  }
  return result;
}

/**
 * Sayfa yan boşluğu: < 390 → 16, 390-1179 → 24, >= 1180 → 48.
 *
 * Not: Brief 390-767 için 20 px istiyor; 20 px 8 pt ölçeğinde bir basamak
 * değildir. Ölçek kuralı üstün tutuldu ve en yakın izin verilen basamak
 * (24) kullanıldı. 12 px'in altına hiçbir koşulda inilmez.
 */
export const PAGE_GUTTER = {
  narrow: 16,
  regular: 24,
  tablet: 24,
  wide: 48,
} as const;

/** Sabit bileşen ölçüleri (boşluk değil, boyut). */
export const SIZES = {
  header: 56,
  bottomNav: 56,
  touch: 44,
  targetGap: 8,
} as const;

/** Alt menü üstü ek güvenli boşluk. */
export const BOTTOM_NAV_GAP = 24;

/** Kullanıcı yazı boyutu kademeleri (Dynamic Type benzeri): 16 / 17 / 19. */
export const BODY_STEPS = { sm: 16, md: 17, lg: 19 } as const;
export type BodyStep = keyof typeof BODY_STEPS;

/** Tipografi ölçeği (mobil / masaüstü). */
export const TYPE_SCALE = {
  h1: { mobile: 28, desktop: 34, lineHeight: 1.25, weight: 600 },
  h2: { mobile: 20, desktop: 22, lineHeight: 1.3, weight: 600 },
  h3: { mobile: 17, desktop: 18, lineHeight: 1.35, weight: 600 },
  body: { mobile: 17, desktop: 17, lineHeight: 1.55, weight: 400 },
  lead: { mobile: 15, desktop: 15, lineHeight: 1.5, weight: 400 },
  meta: { mobile: 13, desktop: 13, lineHeight: 1.4, weight: 400 },
  label: {
    mobile: 12,
    desktop: 12,
    lineHeight: 1.3,
    weight: 600,
    letterSpacing: "0.02em",
  },
} as const;

export type TypeRole = keyof typeof TYPE_SCALE;

/** Okuma kolonu: en fazla 68 karakter. */
export const MEASURE = "68ch";

/** Üç kolonlu yerleşim ölçüleri. */
export const LAYOUT = {
  maxWidth: 1440,
  edge: 48,
  leftRail: 236,
  rightRail: 320,
  tabletRail: 300,
  breakpoint3Col: 1180,
} as const;

/** Üst başlık ile ilk kart arası (sabit ilişki). */
export const AFTER_HEADER = 32;

const pxToRem = (px: number): string =>
  `${(px / 16).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}rem`;

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Kullanıcı yazı boyutu tercihi (A− / A / A+). Değer yalnızca metni
 * ölçekler; boşluk token'ları bu değişkenden etkilenmez.
 */
export function scaledSize(role: TypeRole, px: number): string {
  const expression = `calc(${pxToRem(px)} * var(--type-scale))`;
  // Gövde hiçbir kademede 16 px'in altına inmez.
  return role === "body" ? `max(1rem, ${expression})` : expression;
}

/**
 * Bileşen BOYUTLARI (ikon, avatar, çubuk) — boşluk değil.
 * Tailwind varsayılan ölçeği korunur ki ikon boyutları değişmesin.
 */
export function sizingThemeEntries(): Record<string, string> {
  const sizes: Record<string, string> = {
    px: "1px",
    "0.5": "0.125rem",
    "1": "0.25rem",
    "1.5": "0.375rem",
    "2": "0.5rem",
    "2.5": "0.625rem",
    "3": "0.75rem",
    "3.5": "0.875rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "7": "1.75rem",
    "8": "2rem",
    "9": "2.25rem",
    "10": "2.5rem",
    "11": "2.75rem",
    "12": "3rem",
    "14": "3.5rem",
    "16": "4rem",
    "20": "5rem",
    "24": "6rem",
    "28": "7rem",
    "32": "8rem",
    "36": "9rem",
    "40": "10rem",
    "44": "11rem",
    "48": "12rem",
    "52": "13rem",
    "56": "14rem",
    "60": "15rem",
    "64": "16rem",
    "72": "18rem",
    "80": "20rem",
    "96": "24rem",
    auto: "auto",
    full: "100%",
    screen: "100vw",
    min: "min-content",
    max: "max-content",
    fit: "fit-content",
  };

  // `touch` = 44 px (WCAG hedefi), `header` = 56 px, `nav` = 56 px.
  sizes.touch = "var(--size-touch)";
  sizes.header = "var(--size-header)";
  sizes.nav = "var(--size-bottom-nav)";
  sizes.measure = "var(--measure)";

  return sizes;
}

/** Tailwind theme.spacing için anahtarlar (hepsi CSS değişkenine bağlı). */
export function spacingThemeEntries(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const role of Object.keys(SPACING_ROLES) as SpacingRole[]) {
    entries[kebab(role)] = `var(--sp-${kebab(role)})`;
  }

  // Sayısal anahtarlar da aynı ölçeğe bağlanır (p-4 = space-4 = 16 px).
  // Böylece Tailwind varsayılan ölçeği devre dışı kalır; ölçek dışı değer
  // (p-3.5, p-11 gibi) derlenmez ve fark edilir.
  for (const step of SPACE_STEPS) {
    entries[`${step}`] = `var(--space-${step})`;
    entries[`space-${step}`] = `var(--space-${step})`;
  }

  entries.afterHeader = "var(--space-after-header)";
  entries.touch = "var(--size-touch)";
  entries.header = "var(--size-header)";
  entries.nav = "var(--size-bottom-nav)";
  entries.measure = "var(--measure)";

  return entries;
}

function spacingVars(density: Density): string[] {
  const resolved = resolveAll(density);

  const lines = (Object.keys(resolved) as SpacingRole[]).map(
    (role) => `  --sp-${kebab(role)}: ${pxToRem(resolved[role])};`,
  );

  // globals.css'teki okunabilir sınıflar için takma adlar (aynı kaynak).
  const aliases: Record<string, number> = {
    "space-card-pad-y": resolved.cardY,
    "space-card-pad-x": resolved.cardX,
    "space-card-gap": resolved.cardGap,
    "space-section-gap": resolved.sectionGap,
    "space-title-body": resolved.titleBody,
    "space-title-spot": resolved.titleSpot,
    "space-spot-meta": resolved.spotMeta,
    "space-inline": resolved.inline,
    "space-rail-gap": resolved.columnGap,
    "space-section-head": resolved.blockBreath,
    "sp-top-gap": resolved.topGap,
    "sp-block-gap": resolved.blockGap,
    "space-block-gap": resolved.blockGap,
  };

  for (const [name, value] of Object.entries(aliases)) {
    lines.push(`  --${name}: ${pxToRem(value)};`);
  }

  return lines;
}

/** globals.css'in import ettiği üretilmiş içerik. */
export function buildTokensCss(): string {
  const header = [
    "/* OTOMATİK ÜRETİLDİ — elle düzenlemeyin.",
    " * Kaynak: lib/design/tokens.ts",
    " * Üretim: node scripts/generate-tokens.mjs",
    " */",
  ];

  const scale = SPACE_STEPS.map(
    (step) => `  --space-${step}: ${pxToRem(SPACE_SCALE[step])};`,
  );

  const sizes = [
    `  --size-header: ${pxToRem(SIZES.header)};`,
    `  --size-bottom-nav: ${pxToRem(SIZES.bottomNav)};`,
    `  --size-touch: ${pxToRem(SIZES.touch)};`,
    `  --size-target-gap: ${pxToRem(SIZES.targetGap)};`,
    `  --bottom-nav-gap: ${pxToRem(BOTTOM_NAV_GAP)};`,
    `  --bottom-clearance: calc(var(--size-bottom-nav) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px));`,
    `  --page-gutter-narrow: ${pxToRem(PAGE_GUTTER.narrow)};`,
    `  --page-gutter: ${pxToRem(PAGE_GUTTER.regular)};`,
    `  --page-gutter-tablet: ${pxToRem(PAGE_GUTTER.tablet)};`,
    `  --page-gutter-wide: ${pxToRem(PAGE_GUTTER.wide)};`,
    `  --page-pad: ${pxToRem(PAGE_GUTTER.narrow)};`,
    `  --space-after-header: ${pxToRem(AFTER_HEADER)};`,
  ];

  const typeVars = (Object.keys(TYPE_SCALE) as TypeRole[]).flatMap((role) => {
    const entry = TYPE_SCALE[role];
    const tracking =
      "letterSpacing" in entry && entry.letterSpacing
        ? [
            `  --type-${role}-tracking: ${entry.letterSpacing};`,
            `  --ls-${role}: ${entry.letterSpacing};`,
          ]
        : [];

    return [
      `  --type-${role}-size: ${scaledSize(role, entry.mobile)};`,
      `  --type-${role}-lh: ${entry.lineHeight};`,
      `  --type-${role}-weight: ${entry.weight};`,
      `  --fs-${role}: var(--type-${role}-size);`,
      `  --lh-${role}: var(--type-${role}-lh);`,
      `  --fw-${role}: var(--type-${role}-weight);`,
      ...tracking,
    ];
  });

  const desktopType = (Object.keys(TYPE_SCALE) as TypeRole[])
    .filter((role) => TYPE_SCALE[role].desktop !== TYPE_SCALE[role].mobile)
    .map(
      (role) =>
        `    --type-${role}-size: ${scaledSize(role, TYPE_SCALE[role].desktop)};`,
    );

  const densityBlocks = DENSITIES.map(
    (density) =>
      `html[data-density="${density}"] {\n${spacingVars(density).join("\n")}\n}`,
  );

  return `${header.join("\n")}

:root {
  --type-scale: 1;
${scale.join("\n")}

${sizes.join("\n")}

  /* Hareket ve odak (token) */
  --motion-fast: 150ms;
  --motion-ease: cubic-bezier(0.2, 0, 0.2, 1);
  --focus-ring: #3b82f6;
  --focus-ring-width: 0.125rem;

${typeVars.join("\n")}

  --text-step-sm: ${pxToRem(BODY_STEPS.sm)};
  --text-step-md: ${pxToRem(BODY_STEPS.md)};
  --text-step-lg: ${pxToRem(BODY_STEPS.lg)};

  --measure: ${MEASURE};
  --layout-max: ${pxToRem(LAYOUT.maxWidth)};
  --rail-left: ${pxToRem(LAYOUT.leftRail)};
  --rail-right: ${pxToRem(LAYOUT.rightRail)};
  --rail-tablet: ${pxToRem(LAYOUT.tabletRail)};
}

/* JS yoksa: mobilde Geniş, >= 768 px Dengeli. */
html:not([data-density]) {
${spacingVars("comfortable").join("\n")}
}

@media (min-width: 390px) {
  :root {
    --page-pad: var(--page-gutter);
  }
}


@media (min-width: 768px) {
  html:not([data-density]) {
${spacingVars("balanced").join("\n")}
  }
}

${densityBlocks.join("\n\n")}

@media (min-width: 1024px) {
  :root {
${desktopType.join("\n")}
  }
}

@media (min-width: 1180px) {
  :root {
    --page-pad: var(--page-gutter-wide);
  }
}
`;
}
