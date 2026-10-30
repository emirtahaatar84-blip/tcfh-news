# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Base: shared Alpine image with OpenSSL (required by Prisma engines)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Build: generate Prisma Client and the Next.js standalone output
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Runtime: minimal standalone image + Prisma CLI for startup migrations
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

RUN addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Bakım/örnek tohumlama betikleri (scripts/portrait-sample.mjs)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# The standalone server does not include the Prisma CLI. It is needed once at
# container start to apply pending migrations to the persistent SQLite volume.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/prisma/data \
  && chown -R nextjs:nodejs /app/prisma

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
