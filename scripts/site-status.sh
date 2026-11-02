#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# SITE DURUMU — salt okunur.
#
# Hiçbir şeyi değiştirmez, hiçbir dosyayı silmez. Yalnızca okur ve özetler.
# Paneldeki operasyon ajanı da bu betiği kullanır.
#
# Kullanım:  sh scripts/site-status.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu

CONTAINER="${CONTAINER:-micro-news}"

echo "════════════════════════════════════════════════════════════════"
echo " SITE DURUMU · $(date '+%d.%m.%Y %H:%M') · konteyner: $CONTAINER"
echo "════════════════════════════════════════════════════════════════"

# ── 1. Konteyner ────────────────────────────────────────────────────────────
echo
echo "── KONTEYNER ──"
docker ps --filter "name=$CONTAINER" \
  --format '  {{.Names}} · {{.Status}} · {{.Ports}}' 2>/dev/null || echo "  (docker okunamadı)"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  echo "  ⚠ konteyner çalışmıyor"
  exit 0
fi

# ── 2. Sağlık ucu ───────────────────────────────────────────────────────────
echo
echo "── SAĞLIK (HTTP) ──"
if command -v curl >/dev/null 2>&1; then
  curl -s --max-time 8 "http://127.0.0.1:3000/api/health" 2>/dev/null \
    | tr ',' '\n' | grep -E '"status"|"pipeline"|"hoursSincePublish"|"lastPublishedAt"' \
    | sed 's/^/  /' || echo "  (yanıt yok)"
else
  echo "  (curl yok — atlandı)"
fi

# ── 3. Veritabanı sayaçları ─────────────────────────────────────────────────
echo
echo "── VERİTABANI ──"
docker exec -i "$CONTAINER" node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const [news, single, verified3, portraits, review, digests] = await Promise.all([
    p.newsItem.count({ where: { removedAt: null } }),
    p.newsItem.count({ where: { removedAt: null, verifiedSourceCount: 1 } }),
    p.newsItem.count({ where: { removedAt: null, verifiedSourceCount: { gte: 3 } } }),
    p.portrait.count({ where: { status: "published", removedAt: null } }),
    p.portrait.count({ where: { status: "review" } }),
    p.dailyDigest.count().catch(() => 0),
  ]);
  const last = await p.newsItem.findFirst({
    where: { removedAt: null }, orderBy: { createdAt: "desc" },
    select: { createdAt: true, title: true },
  });
  const hours = last ? ((Date.now() - last.createdAt.getTime()) / 3600000).toFixed(1) : "?";
  console.log(`  haber: ${news} · tek kaynak: ${single} · 3+ kaynak: ${verified3}`);
  console.log(`  portre: ${portraits} yayında · ${review} incelemede · özet: ${digests}`);
  console.log(`  son haber: ${hours} saat önce — ${(last?.title ?? "").slice(0, 48)}`);
  await p.$disconnect();
})().catch((e) => { console.log("  (db okunamadı: " + String(e.message).slice(0, 60) + ")"); });
' 2>/dev/null || echo "  (db sorgusu başarısız)"

# ── 4. Yayılma motoru ───────────────────────────────────────────────────────
echo
echo "── YAYILMA (son 24 saat) ──"
docker exec -i "$CONTAINER" node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 86400000);
  const rows = await p.distributionLog.groupBy({
    by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: true,
  }).catch(() => []);
  if (!rows.length) { console.log("  (kayıt yok)"); await p.$disconnect(); return; }
  const m = {};
  for (const r of rows) {
    m[r.channel] ??= { sent: 0, failed: 0, skipped: 0 };
    if (r.status === "sent") m[r.channel].sent += r._count;
    else if (r.status === "failed") m[r.channel].failed += r._count;
    else m[r.channel].skipped += r._count;
  }
  for (const [c, s] of Object.entries(m)) {
    console.log(`  ${c.padEnd(10)} gönderildi:${s.sent} başarısız:${s.failed} atlandı:${s.skipped}`);
  }
  await p.$disconnect();
})().catch(() => {});
' 2>/dev/null || echo "  (sorgu başarısız)"

# ── 5. Son hatalar ──────────────────────────────────────────────────────────
echo
echo "── SON HATALAR (son 300 log satırı) ──"
docker logs "$CONTAINER" --tail 300 2>&1 \
  | grep -iE 'error|failed|başarısız|hata' \
  | grep -vE 'story.rejected|factcheck-failed|story.skipped' \
  | tail -8 | sed 's/^/  /' || echo "  (hata yok)"

# ── 6. Sistem ───────────────────────────────────────────────────────────────
echo
echo "── SİSTEM ──"
df -h / 2>/dev/null | tail -1 | awk '{print "  disk: "$3" / "$2" ("$5" dolu)"}'
free -h 2>/dev/null | awk '/^Mem:/{print "  bellek: "$3" / "$2}'
uptime 2>/dev/null | sed 's/^/  /'

echo
echo "════════════════════════════════════════════════════════════════"
