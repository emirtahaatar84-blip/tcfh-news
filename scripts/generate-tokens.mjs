#!/usr/bin/env node
/**
 * Aralık/tipografi belirteçlerinden CSS üretir.
 *
 * Tek kaynak: lib/design/tokens.ts
 * Çıktı: app/generated/tokens.css
 *
 * `prebuild` ve `predev` adımlarında otomatik çalışır; tests/tokens.test.ts
 * üretilen dosyanın kaynakla aynı olduğunu doğrular (kayma olmaz).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function loadTokens() {
  // Basit, bağımlılıksız TS → JS dönüşümü: Node 22 tip soyma ile .ts
  // dosyalarını doğrudan içe aktarabilir.
  const mod = await import(pathToFileURL(resolve(root, "lib/design/tokens.ts")).href);
  return mod;
}

const tokens = await loadTokens();
const css = tokens.buildTokensCss();

const target = resolve(root, "app/generated/tokens.css");
await mkdir(dirname(target), { recursive: true });

let previous = "";
try {
  previous = await readFile(target, "utf8");
} catch {
  previous = "";
}

if (previous === css) {
  console.log("[tokens] app/generated/tokens.css güncel.");
} else if (process.argv.includes("--check")) {
  console.error(
    "[tokens] app/generated/tokens.css kaynakla eşleşmiyor. `npm run tokens:build` çalıştırın.",
  );
  process.exit(1);
} else {
  await writeFile(target, css, "utf8");
  console.log("[tokens] app/generated/tokens.css yazıldı.");
}
