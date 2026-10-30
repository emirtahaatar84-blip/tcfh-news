#!/usr/bin/env node
/**
 * Token senkron kontrolü: `app/generated/tokens.css` ile
 * `lib/design/tokens.ts` aynı mı? CI'da `npm run tokens:check` olarak
 * çalışır; fark varsa hata koduyla çıkar.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const mod = await import(pathToFileURL(resolve(root, "lib/design/tokens.ts")).href);

const expected = mod.buildTokensCss();
const actual = await readFile(resolve(root, "app/generated/tokens.css"), "utf8");

if (expected !== actual) {
  console.error(
    "[tokens:check] app/generated/tokens.css kaynakla uyuşmuyor. `npm run tokens:build` çalıştırın.",
  );
  process.exit(1);
}

console.log("[tokens:check] token dosyası güncel.");
