# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
COPY ["Пример исходников/Каталог выгрузка с golova.xlsx", "./seed-data/catalog.xlsx"]

ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV CATALOG_XLSX=/app/seed-data/catalog.xlsx
# Build-time placeholders; real values come from runtime env
ENV DATABASE_URL="postgresql://crm:crm@db:5432/crm_event?schema=public"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV AUTH_URL="http://localhost:3000"

# Generate AFTER full source copy so client always matches schema.prisma
RUN npx prisma generate

# Turbopack production build is often 5–10× slower inside Docker/VPS;
# Webpack is the reliable path for image builds (local `next build` can stay default).
RUN npx next build --webpack

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CATALOG_XLSX=/app/seed-data/catalog.xlsx
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone server + static assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# migrate deploy + seed need prisma CLI, tsx, and project files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed-data ./seed-data
COPY --from=builder /app/src/lib/catalog-owner.ts ./src/lib/catalog-owner.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
