#!/usr/bin/env node
/**
 * Münazara RSS adaylarını doğrular.
 *
 * Kural (11.7): her aday feed için HTTP 200, geçerli XML/Atom, en az 5
 * item/entry ve son 30 günde en az 1 güncelleme aranır. Geçmeyen feed
 * devre dışı bırakılır. Bu betik SUNUCU TARAFINDA/CLI'da çalışır; tarayıcı
 * hiçbir zaman üçüncü tarafa istek atmaz.
 *
 * Kullanım:
 *   node scripts/validate-debate-feeds.mjs            # rapor (metin)
 *   node scripts/validate-debate-feeds.mjs --json     # JSON rapor
 *   node scripts/validate-debate-feeds.mjs --write    # lib/debate/feed-status.json
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CANDIDATES = [
  { name: "The Conversation", url: "https://theconversation.com/global/articles.atom" },
  { name: "Brookings", url: "https://www.brookings.edu/feed/" },
  { name: "DW English", url: "https://rss.dw.com/rdf/rss-en-all" },
  { name: "Debating Matters", url: "https://www.debatingmatters.com/feed/" },
  { name: "Intelligence Squared", url: "https://www.intelligencesquared.com/feed/" },
  { name: "Carnegie Council", url: "https://www.carnegiecouncil.org/rss/articles" },
  { name: "Pew Research", url: "https://www.pewresearch.org/feed/" },
  { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  { name: "Anadolu Ajansı", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel" },
  { name: "TÜBİTAK", url: "https://www.tubitak.gov.tr/tr/rss" },
];

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3_000_000;

const args = new Set(process.argv.slice(2));

function decodeEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const match = block.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return "";
}

function attribute(block, names, attr) {
  for (const name of names) {
    const pattern = new RegExp(`<${name}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i");
    const match = block.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return "";
}

/** RSS 2.0 <item> ve Atom <entry> bloklarını çıkarır. */
export function parseFeedItems(xml) {
  const blocks = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;

  for (const match of xml.matchAll(itemRe)) blocks.push(match[0]);
  for (const match of xml.matchAll(entryRe)) blocks.push(match[0]);

  return blocks.map((block) => {
    const title = stripTags(firstTag(block, ["title"]));
    const link =
      firstTag(block, ["link"]) ||
      attribute(block, ["link"], "href") ||
      firstTag(block, ["guid"]) ||
      attribute(block, ["guid"], "isPermaLink") === "false"
        ? firstTag(block, ["link"]) || attribute(block, ["link"], "href") || firstTag(block, ["guid"])
        : "";
    const summary = stripTags(
      firstTag(block, ["description", "summary", "content", "content:encoded"]),
    ).slice(0, 400);
    const date = firstTag(block, ["pubDate", "published", "updated", "dc:date"]);
    const guid =
      firstTag(block, ["guid", "id"]) || attribute(block, ["guid", "id"], "href") || link;
    const category = stripTags(
      firstTag(block, ["category", "dc:subject"]),
    ).slice(0, 60);

    return { title, link: link.trim(), summary, date, guid: guid.trim(), category };
  });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function validate(candidate) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(candidate.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "emirtahaatar-debate-feed-validator/1.0 (+https://emirtahaatar.com.tr)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = await response.arrayBuffer();
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(buffer).slice(0, MAX_BYTES);

    if (response.status !== 200) {
      return fail(candidate, `HTTP ${response.status}`, startedAt, contentType, buffer.byteLength);
    }

    const looksXml =
      /<rss\b|<feed\b|<rdf:RDF\b/i.test(xml.slice(0, 4000)) ||
      /xml|rss|atom/i.test(contentType);

    if (!looksXml) {
      return fail(candidate, "Geçerli XML/Atom değil", startedAt, contentType, buffer.byteLength);
    }

    const items = parseFeedItems(xml);

    if (items.length < 5) {
      return fail(
        candidate,
        `Yalnızca ${items.length} öğe (en az 5 gerekli)`,
        startedAt,
        contentType,
        buffer.byteLength,
      );
    }

    const dated = items
      .map((item) => parseDate(item.date))
      .filter((date) => date !== null);
    const newest = dated.length > 0 ? new Date(Math.max(...dated.map((d) => d.getTime()))) : null;
    const ageDays = newest ? Math.floor((Date.now() - newest.getTime()) / 86_400_000) : null;

    if (ageDays === null || ageDays > 30) {
      return fail(
        candidate,
        newest ? `Son güncelleme ${ageDays} gün önce` : "Tarih alanı okunamadı",
        startedAt,
        contentType,
        buffer.byteLength,
      );
    }

    return {
      name: candidate.name,
      url: candidate.url,
      status: "ok",
      httpStatus: response.status,
      contentType,
      bytes: buffer.byteLength,
      itemCount: items.length,
      newestItemAt: newest.toISOString(),
      ageDays,
      durationMs: Date.now() - startedAt,
      note: "Doğrulandı",
      sample: items.slice(0, 2).map((item) => ({
        title: item.title.slice(0, 120),
        link: item.link,
        date: item.date,
        category: item.category,
      })),
      mapping: {
        title: "title",
        link: "__link_href__",
        date: "pubDate|published|updated",
        summary: "description|summary|content",
        category: "category",
      },
    };
  } catch (error) {
    return fail(
      candidate,
      error?.name === "AbortError" ? "Zaman aşımı" : (error?.message ?? "Bilinmeyen hata"),
      startedAt,
      "",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

function fail(candidate, reason, startedAt, contentType, bytes) {
  return {
    name: candidate.name,
    url: candidate.url,
    status: "failed",
    reason,
    contentType,
    bytes,
    itemCount: 0,
    durationMs: Date.now() - startedAt,
  };
}

const controller = new AbortController();
const results = [];

for (const candidate of CANDIDATES) {
  const result = await validate(candidate);
  results.push(result);
}

const ok = results.filter((result) => result.status === "ok");
const failed = results.filter((result) => result.status === "failed");
const report = {
  checkedAt: new Date().toISOString(),
  total: results.length,
  ok: ok.length,
  failed: failed.length,
  results,
};

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Münazara RSS doğrulama · ${report.checkedAt}`);
  console.log(`${ok.length}/${results.length} feed geçti\n`);
  for (const result of results) {
    const line =
      result.status === "ok"
        ? `  ✓ ${result.name.padEnd(22)} ${String(result.itemCount).padStart(4)} öğe · ${result.ageDays} gün · ${result.durationMs}ms`
        : `  ✗ ${result.name.padEnd(22)} ${result.reason}`;
    console.log(line);
  }
}

if (args.has("--write")) {
  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(here, "../lib/debate/feed-status.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nRapor yazıldı: ${target}`);
}

void controller;
