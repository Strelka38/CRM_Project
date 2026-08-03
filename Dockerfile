# syntax=docker/dockerfile:1
#
# Optimized for small VPS (2 vCPU): layer cache + Next .next/cache mount +
# single webpack worker. Prefer incremental builds (do NOT use --no-cache
# unless schema/deps are badly stuck). For weakest VMs, build on a laptop
# and load the image: ./scripts/docker-build-export.sh

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY web/package.json web/package-lock.json ./
# Prisma first — generate is cached while schema unchanged
COPY web/prisma ./prisma
RUN npx prisma generate

COPY web/ ./
COPY ["Пример исходников/Каталог выгрузка с golova.xlsx", "./seed-data/catalog.xlsx"]
# Re-generate after full copy so client always matches final schema.prisma
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
ENV DOCKER_BUILD_CPUS=1
# Keep heap modest on 2–4 GB VMs (avoids swap storms)
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV UV_THREADPOOL_SIZE=2
ENV CATALOG_XLSX=/app/seed-data/catalog.xlsx
ENV DATABASE_URL="postgresql://crm:crm@db:5432/crm_event?schema=public"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV AUTH_URL="http://localhost:3000"

# Persist webpack/Next compile cache between builds (BuildKit)
RUN --mount=type=cache,target=/app/.next/cache \
    npx next build --webpack

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CATALOG_XLSX=/app/seed-data/catalog.xlsx
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed-data ./seed-data
COPY --from=builder /app/src/lib/catalog-owner.ts ./src/lib/catalog-owner.ts
COPY --from=builder /app/src/lib/ensure-schema.ts ./src/lib/ensure-schema.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/uploads && test -f prisma/ensure-schema.ts && test -f prisma/ensure-columns.sql


EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
