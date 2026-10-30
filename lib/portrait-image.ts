import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Portre kapak görselleri — TELİFSİZ, tamamen özgün üretim.
 *
 * ÖNEMLİ (telif): Portre kapaklarında dış kaynakların (kantan.news, haber
 * ajansları, fotoğrafçılar) görselleri ASLA kullanılmaz. Her portre için
 * sıfırdan bir editoryal illüstrasyon üretilir; gerçek yüz, logo, marka veya
 * metin içermez. Böylece hem telif riski hem de kişilik hakkı riski ortadan
 * kalkar (özel nitelikli veri/ifşa riski yok).
 *
 * Üretim zinciri:
 *   1. Cloudflare Workers AI — flux-1-schnell (CF_AI_TOKEN + CF_AI_ACCOUNT_ID
 *      tanımlıysa; ücretsiz kotası var)
 *   2. Pollinations.ai — anahtarsız çalışır, her zaman denenir
 *   3. Deterministik SVG — kategori renkleriyle yerel üretim (asla başarısız olmaz)
 *
 * Üretilen JPEG'ler media volume'ünde ({MEDIA_DIR}/{id}.jpg) saklanır ve
 * /api/portraits/:id/image ucundan immutable cache ile servis edilir.
 */

const MEDIA_DIR = path.join(process.cwd(), "media", "portraits");

// 16:9 kapak — kart ve detay sayfası için.
const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 576;

const POLLINATIONS_TIMEOUT_MS = 45_000;
const CLOUDFLARE_TIMEOUT_MS = 60_000;
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const ID_PATTERN = /^[a-zA-Z0-9_-]{5,60}$/;

/** Kategori renk paleti — arayüz rozet renkleriyle uyumlu. */
const CATEGORY_COLORS: Record<string, { accent: string; text: string }> = {
  Gündem: { accent: "#a1a1aa", text: "#d4d4d8" },
  Teknoloji: { accent: "#eab308", text: "#facc15" },
  "Yapay Zekâ": { accent: "#22d3ee", text: "#67e8f9" },
  Ekonomi: { accent: "#10b981", text: "#34d399" },
  Siyaset: { accent: "#ef4444", text: "#f87171" },
  Spor: { accent: "#f97316", text: "#fb923c" },
  Bilim: { accent: "#3b82f6", text: "#60a5fa" },
  Dünya: { accent: "#0ea5e9", text: "#38bdf8" },
  Sağlık: { accent: "#f43f5e", text: "#fb7185" },
  Kültür: { accent: "#8b5cf6", text: "#a78bfa" },
  Diğer: { accent: "#71717a", text: "#a1a1aa" },
};

function stableSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 2_000_000_000;
}

/**
 * Portre kapağı istemi: soyut, editoryal, yüzsüz. Konu adı geçse bile
 * "no real faces / no likeness" kuralı korunur.
 */
function buildPrompt(input: {
  title: string;
  category: string;
  subjectType: string;
}): string {
  const keywords = input.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 8)
    .join(", ");

  const subjectHint =
    input.subjectType === "kisi"
      ? "abstract human silhouette in profile, faceless, symbolic"
      : input.subjectType === "kurum"
        ? "abstract institutional architecture, geometric emblem shapes"
        : "abstract documentary scene, layered shapes representing an event";

  return `editorial magazine cover illustration about ${keywords}, ${input.category.toLowerCase()} theme, ${subjectHint}, minimalist flat vector art, muted dark palette with one accent color, soft grain texture, wide banner composition, no text, no words, no letters, no logos, no watermarks, no real faces, no recognizable persons, no photographs`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Sağlayıcı 1: Cloudflare Workers AI ─────────────────────────────────────

async function fromCloudflare(prompt: string): Promise<Buffer | null> {
  const accountId = process.env.CF_AI_ACCOUNT_ID?.trim();
  const token = process.env.CF_AI_TOKEN?.trim();

  if (!accountId || !token) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, steps: 4 }),
        signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      result?: { image?: string };
    };

    const base64 = payload?.result?.image;
    if (typeof base64 !== "string" || base64.length < 100) return null;

    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 1000 ? buffer : null;
  } catch {
    return null;
  }
}

// ─── Sağlayıcı 2: Pollinations ───────────────────────────────────────────────

async function fromPollinations(
  prompt: string,
  seed: number,
): Promise<Buffer | null> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${IMAGE_WIDTH}&height=${IMAGE_HEIGHT}&nologo=true&seed=${seed}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 1000 ? buffer : null;
  } catch {
    return null;
  }
}

// ─── Sağlayıcı 3: Deterministik SVG (asla başarısız olmaz) ───────────────────

/** Kategori renkleri + tohumdan üretilen özgün geometrik kapak. */
export function portraitFallbackSvg(category: string, seed: number): string {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Diğer"];

  // Tohumdan türetilen parametreler — her portre farklı görünür.
  const ringRadius = 90 + (seed % 70);
  const rotation = seed % 360;
  const bars = 7 + (seed % 5);

  const barsSvg = Array.from({ length: bars })
    .map((_, index) => {
      const x = 80 + index * ((IMAGE_WIDTH - 160) / bars);
      const height = 40 + ((seed >> (index * 2)) % 190);
      const y = IMAGE_HEIGHT - 90 - height;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(
        (IMAGE_WIDTH - 160) / bars -
        10
      ).toFixed(1)}" height="${height}" rx="6" fill="${colors.accent}" opacity="${(
        0.12 +
        (index % 4) * 0.05
      ).toFixed(2)}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" role="img" aria-label="Portre kapak illüstrasyonu">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e0f12"/>
      <stop offset="100%" stop-color="#16181c"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)"/>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#glow)"/>
  <g transform="rotate(${rotation} ${IMAGE_WIDTH / 2} ${IMAGE_HEIGHT / 2})">
    <circle cx="${IMAGE_WIDTH / 2}" cy="${IMAGE_HEIGHT / 2}" r="${ringRadius}" fill="none" stroke="${
      colors.accent
    }" stroke-opacity="0.35" stroke-width="2"/>
    <circle cx="${IMAGE_WIDTH / 2}" cy="${IMAGE_HEIGHT / 2}" r="${
      ringRadius + 34
    }" fill="none" stroke="${colors.text}" stroke-opacity="0.14" stroke-width="1"/>
  </g>
  ${barsSvg}
  <text x="${IMAGE_WIDTH / 2}" y="${
    IMAGE_HEIGHT / 2 + 8
  }" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${
    colors.text
  }" opacity="0.55" letter-spacing="3">${escapeXml(category.toUpperCase())}</text>
</svg>`;
}

// ─── Durum (süreç içi, sıralı kuyruk) ───────────────────────────────────────

type GenState = {
  queue: Promise<void>;
  inflight: Set<string>;
  /** Son deneme zamanı — başarısız üretimler 10 dk sonra yeniden denenir. */
  attempts: Map<string, number>;
};

const RETRY_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const globalForImages = globalThis as unknown as {
  __portraitImageGen?: GenState;
};

function state(): GenState {
  if (!globalForImages.__portraitImageGen) {
    globalForImages.__portraitImageGen = {
      queue: Promise.resolve(),
      inflight: new Set(),
      attempts: new Map(),
    };
  }
  return globalForImages.__portraitImageGen;
}

/** Üretilmiş görseli diskten okur (yoksa null). */
export async function readPortraitImage(
  id: string,
): Promise<{ data: Buffer; mime: string } | null> {
  if (!ID_PATTERN.test(id)) return null;

  try {
    const data = await readFile(path.join(MEDIA_DIR, `${id}.jpg`));
    return { data, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generate(id: string, prompt: string): Promise<void> {
  if (await readPortraitImage(id)) return;

  const baseSeed = stableSeed(id);

  // Sağlayıcılar aralıklı hata verebilir: birkaç deneme, artan bekleme,
  // her denemede farklı tohum (Pollinations aynı tohumda 402 verebiliyor).
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(attempt * 2500);

    let image = await fromCloudflare(prompt);
    if (!image) {
      // Pollinations IP başına 45 sn'de 1 görsel veriyor. 402 alınca bu
      // görsel için SVG'ye düşeriz; sonraki denemelerde tekrar denenir.
      try {
        image = await fromPollinations(prompt, baseSeed + attempt * 7919);
      } catch {
        image = null;
      }
    }

    if (image) {
      await mkdir(MEDIA_DIR, { recursive: true });
      await writeFile(path.join(MEDIA_DIR, `${id}.jpg`), image);
      return;
    }
  }

  // Tüm denemeler başarısız: route SVG fallback servis eder; 10 dk sonra
  // bir sonraki ziyarette yeniden denenir.
  console.warn(`[portrait-image] sağlayıcılar başarısız, SVG fallback: ${id}`);
}

/**
 * Kapak görseli üretimini kuyruğa alır (fire-and-forget).
 * Hata asla fırlatılmaz; route SVG fallback'e düşer.
 */
export function queuePortraitImage(input: {
  id: string;
  title: string;
  category: string;
  subjectType: string;
}): void {
  if (!ID_PATTERN.test(input.id)) return;

  const current = state();
  if (current.inflight.has(input.id)) return;

  // Başarısız denemeden hemen sonra tekrar denemeyi engelle.
  const lastAttempt = current.attempts.get(input.id) ?? 0;
  if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) return;

  current.attempts.set(input.id, Date.now());
  current.inflight.add(input.id);

  const prompt = buildPrompt(input);

  current.queue = current.queue
    .then(() => generate(input.id, prompt))
    .catch((error) => {
      console.warn(`[portrait-image] üretim hatası (${input.id}):`, error);
    })
    .finally(() => {
      current.inflight.delete(input.id);
    });
}

/** Bekleyen üretimleri tamamlanmasını bekler (bakım betikleri için). */
export async function flushPortraitImages(): Promise<void> {
  await state().queue;
}

/**
 * Bakım: yayınlanmış portrelerden kapağı (JPEG) henüz üretilmemiş olanları
 * kuyruğa alır. Sıralı çalışır; dönen sayı kuyruğa alınan portre sayısıdır.
 */
export async function healPortraitCovers(
  rows: { id: string; title: string; category: string; subjectType: string }[],
): Promise<number> {
  let queued = 0;

  for (const row of rows) {
    const existing = await readPortraitImage(row.id);
    if (existing) continue;

    queuePortraitImage(row);
    queued += 1;
  }

  return queued;
}
