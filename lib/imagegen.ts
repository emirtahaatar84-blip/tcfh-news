import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Telifsiz haber görselleri — RSS kaynak görselleri TELİF riski nedeniyle
 * hiç kullanılmaz; her haber için AI illüstrasyonu üretilir.
 *
 * Üretim zinciri (biri başarısız olursa sıradaki devreye girer):
 *   1. Cloudflare Workers AI — flux-1-schnell (CF_AI_TOKEN + CF_AI_ACCOUNT_ID
 *      tanımlıysa). Ücretsiz kotası var, hızlı ve kaliteli.
 *   2. Pollinations.ai — ANAHTARSIZ çalışır, her zaman denenir (ölçüldü:
 *      ~0.4 sn, 17 KB). Kullanıcı hiçbir ayar yapmadan görsel alsın diye.
 *   3. Deterministik SVG — kategori renkleriyle yerel üretim (asla başarısız olmaz).
 *
 * Not: Zincir, sağlayıcı tanımlıysa Cloudflare'i, değilse Pollinations'ı
 * birincil yapar — böylece hem kendi anahtarını getiren hem hiç anahtarı
 * olmayan kurulumlar çalışır.
 *
 * Üretilen JPEG'ler media volume'ünde ({MEDIA_DIR}/{id}.jpg) saklanır ve
 * /api/news/:id/image ucundan immutable cache ile servis edilir.
 */

const MEDIA_DIR = path.join(process.cwd(), "media", "news");
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 360;
const POLLINATIONS_TIMEOUT_MS = 45_000;
const CLOUDFLARE_TIMEOUT_MS = 60_000;
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * Pollinations hız limiti (IP başına 45 sn). Ücretsiz katmanda aynı IP'den
 * saniyede bir görsel istenirse 402 döner. Bu zaman kadar Pollinations
 * atlanır; kuyruktaki diğer görseller CF'ye veya SVG'ye düşer.
 */
let pollinationsCooldownUntil = 0;

export function pollinationsAvailable(): boolean {
  return Date.now() >= pollinationsCooldownUntil;
}

const ID_PATTERN = /^[a-zA-Z0-9]{5,40}$/;

/** Kategori renk paleti — UI rozet renkleriyle uyumlu. */
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

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** Haber kimliğinden kararlı tohum — aynı haber yeniden üretilse aynı görsel. */
function stableSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 2_000_000_000;
}

/** Haber başlığından görsel istemi — anahtar kelimeler + editoryal stil. */
function buildPrompt(title: string, category: string): string {
  const keywords = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 10)
    .join(", ");

  return `editorial news illustration${keywords ? ` about ${keywords}` : ""}, ${category.toLowerCase()} theme, minimalist flat design, soft muted colors, abstract geometric shapes, clean composition, no text, no words, no letters, no logos, no watermarks, no real faces`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Sağlayıcı 1: Pollinations ───────────────────────────────────────────────

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

    // HIZ LİMİTİ: Pollinations IP başına 45 sn'de 1 görsel veriyor (402/429).
    // Bunu "sağlayıcı çalışmıyor" diye yutmak yanlıştı — görseller sessizce
    // SVG'ye düşüyordu. Şimdi elleçleniyor: süre okunur, sonraki çağrılar
    // bu pencere içinde atlanır.
    if (response.status === 402 || response.status === 429) {
      const body = await response.text().catch(() => "");
      const match = body.match(/(\d+)\s*s/i);
      const waitMs = match ? Number(match[1]) * 1000 : 45_000;
      pollinationsCooldownUntil = Date.now() + waitMs;
      throw new Error(`POLLINATIONS_RATE_LIMIT (${Math.round(waitMs / 1000)} sn)`);
    }

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 1000 ? buffer : null;
  } catch (error) {
    // Hız limiti yukarıda cooldown bıraktı; diğer hatalar sessizce null.
    if (error instanceof Error && error.message.startsWith("POLLINATIONS_RATE_LIMIT")) {
      throw error;
    }
    return null;
  }
}

// ─── Sağlayıcı 2: Cloudflare Workers AI ──────────────────────────────────────

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
      success?: boolean;
    };

    const base64 = payload?.result?.image;
    if (typeof base64 !== "string" || base64.length < 100) return null;

    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 1000 ? buffer : null;
  } catch {
    return null;
  }
}

// ─── Sağlayıcı 3: Deterministik SVG (asla başarısız olmaz) ───────────────────

/** Kategori renkleri + tohumdan üretilen özgün geometrik kapak sanatı. */
export function fallbackSvg(category: string, seed: number): string {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Diğer"];

  let state = (seed || 1) >>> 0;
  const rand = () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };

  let shapes = "";

  for (let i = 0; i < 8; i += 1) {
    const cx = Math.floor(rand() * IMAGE_WIDTH);
    const cy = Math.floor(rand() * IMAGE_HEIGHT);
    const r = 28 + Math.floor(rand() * 100);
    const opacity = (0.05 + rand() * 0.13).toFixed(2);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.accent}" opacity="${opacity}"/>`;
  }

  const barWidth = 60 + Math.floor(rand() * 140);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" ` +
    `viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" role="img" aria-label="${escapeXml(category)}">` +
    `<rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="#0e0f12"/>` +
    shapes +
    `<path d="M0,${IMAGE_HEIGHT} L${barWidth + 160},${IMAGE_HEIGHT} L0,${IMAGE_HEIGHT - 200} Z" ` +
    `fill="${colors.accent}" opacity="0.14"/>` +
    `<rect x="0" y="${IMAGE_HEIGHT - 6}" width="${barWidth}" height="6" fill="${colors.accent}" opacity="0.8"/>` +
    `<text x="28" y="${IMAGE_HEIGHT - 26}" font-family="system-ui,-apple-system,sans-serif" ` +
    `font-size="22" font-weight="700" letter-spacing="0.5" fill="${colors.text}" opacity="0.9">` +
    escapeXml(category) +
    `</text>` +
    `</svg>`
  );
}

// ─── Kuyruk ve depolama ──────────────────────────────────────────────────────

type ImageGenState = {
  inflight: Set<string>;
  queue: Promise<void>;
};

function imageGenState(): ImageGenState {
  const globalForImages = globalThis as unknown as {
    __newsImageGen?: ImageGenState;
  };
  globalForImages.__newsImageGen ??= {
    inflight: new Set<string>(),
    queue: Promise.resolve(),
  };
  return globalForImages.__newsImageGen;
}

/** Üretilmiş görseli diskten okur (yoksa null). */
export async function readNewsImage(
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

async function generateNewsImage(
  id: string,
  title: string,
  category: string,
): Promise<void> {
  if (await readNewsImage(id)) return;

  const prompt = buildPrompt(title, category);
  const seed = stableSeed(id);

  // Sırası TEK yerde belgelenir: Cloudflare (kimlik varsa) → Pollinations
  // (anahtarsız; hız limiti yoksa denenir) → SVG fallback.
  let image = await fromCloudflare(prompt);

  if (!image && pollinationsAvailable()) {
    try {
      image = await fromPollinations(prompt, seed);
    } catch (error) {
      // Hız limiti: bu görseli SVG ile geç, sıradakiler de bekleme bitene
      // kadar Pollinations'ı atlar. Sessizce yutulmaz, loglanır.
      console.warn(`[imagegen] ${(error as Error).message} → SVG fallback: ${id}`);
    }
  } else if (!image) {
    console.warn(`[imagegen] Pollinations bekleme süresinde atlandı: ${id}`);
  }

  if (!image) {
    // SVG fallback route üzerinden DINAMİK servis edilir — diske yazılmaz.
    console.warn(`[imagegen] sağlayıcılar başarısız, SVG fallback: ${id}`);
    return;
  }

  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, `${id}.jpg`), image);
}

/**
 * Görsel üretimini kuyruğa alır (fire-and-forget). Üretimler sıralı
 * yürütülür (dış servislere baskı yapmamak için); hata asla fırlatılmaz.
 */
export function queueNewsImage(
  id: string,
  title: string,
  category: string,
): void {
  const state = imageGenState();
  if (state.inflight.has(id)) return;

  state.inflight.add(id);
  state.queue = state.queue
    .then(() => generateNewsImage(id, title, category))
    .catch((error) => {
      console.warn(`[imagegen] üretim hatası (${id}):`, error);
    })
    .finally(() => {
      state.inflight.delete(id);
    });
}
