#!/usr/bin/env node
/**
 * Görsel doğrulama: 360 / 390 / 768 / 1180 / 1440 px ekran görüntüleri,
 * yoğunluk geçişi, en büyük yazı boyutu ve yatay taşma kontrolü.
 *
 * Gereksinim: `npm run dev` açık olmalı. Brave/Chrome CDP üzerinden sürülür.
 * Kullanım: node scripts/visual-check.mjs [--url http://localhost:3000/tr]
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const targetUrl = urlIndex >= 0 ? args[urlIndex + 1] : "http://localhost:3102/tr";
const outDir = join(process.cwd(), "artifacts/visual");

const BRAVE =
  process.env.BRAVE_BIN ??
  ["/opt/brave.com/brave/brave", "/usr/bin/brave-browser"].find(Boolean);
const PORT = 9333;

const VIEWPORTS = [
  { name: "360", width: 360, height: 900, mobile: true },
  { name: "390", width: 390, height: 900, mobile: true },
  { name: "768", width: 768, height: 1000, mobile: false },
  { name: "1180", width: 1180, height: 1000, mobile: false },
  { name: "1440", width: 1440, height: 1000, mobile: false },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(endpoint, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
      if (response.ok) return await response.json();
    } catch {
      /* tarayıcı henüz hazır değil */
    }
    await sleep(250);
  }
  throw new Error("CDP hazır olmadı");
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.loaded = false;
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      if (message.method === "Page.loadEventFired") this.loaded = true;
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value;
  }

  async goto(url) {
    this.loaded = false;
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 80 && !this.loaded; i += 1) await sleep(100);
    await sleep(600);
  }

  async screenshot(path) {
    const shot = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(shot.data, "base64"));
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = spawn(
    BRAVE,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=/tmp/opencode/brave-visual",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const version = await waitForJson("/json/version");
    const list = await waitForJson("/json/list");
    const page = list.find((entry) => entry.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl || version.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    const session = new Session(ws);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });

    const report = [];

    for (const viewport of VIEWPORTS) {
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });

      await session.goto(targetUrl);
      await session.screenshot(join(outDir, `${viewport.name}.png`));

      const metrics = await session.evaluate(`(() => {
        const root = document.documentElement;
        const style = getComputedStyle(root);
        const shell = document.querySelector('.page-shell');
        const shellStyle = shell ? getComputedStyle(shell) : null;
        const card = document.querySelector('article.surface-card');
        const cardStyle = card ? getComputedStyle(card) : null;
        const title = card?.querySelector('h3');
        const titleStyle = title ? getComputedStyle(title) : null;
        const body = card?.querySelector('p.t-lead');
        const bodyStyle = body ? getComputedStyle(body) : null;
        return {
          density: root.dataset.density,
          fontSize: root.dataset.fontSize,
          pageGutter: shellStyle?.paddingLeft,
          headerHeight: getComputedStyle(document.querySelector('header')).height,
          cardPadY: cardStyle?.paddingTop,
          cardPadX: cardStyle?.paddingLeft,
          cardGap: style.getPropertyValue('--sp-card-gap').trim(),
          sectionGap: style.getPropertyValue('--sp-section-gap').trim(),
          h3: titleStyle?.fontSize,
          body: bodyStyle?.fontSize,
          overflowX: root.scrollWidth > root.clientWidth + 1,
        };
      })()`);

      report.push({ viewport: viewport.name, ...metrics });
    }

    // En büyük yazı boyutu + sıkı yoğunluk: kırpma / taşma kontrolü
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 360,
      screenHeight: 900,
    });

    await session.goto(targetUrl);
    await session.evaluate(`(() => {
      const key = 'eth.v1.prefs';
      const raw = localStorage.getItem(key);
      const prefs = raw ? JSON.parse(raw) : { storageVersion: 1 };
      localStorage.setItem(key, JSON.stringify({
        ...prefs,
        fontSize: 'lg',
        density: 'compact',
        theme: 'dark',
        storageVersion: 1,
      }));
    })()`);
    await session.goto(targetUrl);
    await session.screenshot(join(outDir, "360-max-text-compact.png"));

    const extremes = await session.evaluate(`(() => {
      const root = document.documentElement;
      const card = document.querySelector('article.surface-card');
      const title = card?.querySelector('h3');
      const style = getComputedStyle(root);
      return {
        density: root.dataset.density,
        h3: title ? getComputedStyle(title).fontSize : null,
        cardPadY: card ? getComputedStyle(card).paddingTop : null,
        cardGap: style.getPropertyValue('--sp-card-gap').trim(),
        overflowX: root.scrollWidth > root.clientWidth + 1,
        // line-clamp zaten kasıtlı kırpma; yalnızca clamp DIŞI kırpmayı ara.
        clipped:
          title && !title.className.includes('line-clamp')
            ? title.scrollHeight > title.clientHeight + 1
            : false,
      };
    })()`);
    report.push({ viewport: "360-max-text-compact", ...extremes });

    // Yoğunluk geçişi: yazı boyutu sabit mi?
    const densitySwap = await session.evaluate(`(async () => {
      const title = document.querySelector('article.surface-card h3');
      const before = getComputedStyle(title).fontSize;
      const gaps = [];
      for (const mode of ['compact', 'balanced', 'comfortable']) {
        document.documentElement.dataset.density = mode;
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        gaps.push({
          mode,
          gap: getComputedStyle(document.documentElement)
            .getPropertyValue('--sp-card-gap')
            .trim(),
        });
      }
      // Metin boyutu yoğunluktan etkilenmemeli.
      document.documentElement.dataset.density = 'comfortable';
      const after = getComputedStyle(
        document.querySelector('article.surface-card h3'),
      ).fontSize;
      return { before, after, gaps };
    })()`);
    report.push({ densitySwap });

    await writeFile(
      join(outDir, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log(JSON.stringify(report, null, 2));
  } finally {
    browser.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("Görsel kontrol başarısız:", error.message);
  process.exit(1);
});
