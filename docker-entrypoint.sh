#!/bin/sh
set -eu

mkdir -p /app/prisma/data

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="file:/app/prisma/data/news.db"
fi

echo "[entrypoint] Applying Prisma migrations..."
node ./node_modules/prisma/build/index.js migrate deploy \
  --schema=/app/prisma/schema.prisma

echo "[entrypoint] Starting Next.js on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec "$@"
