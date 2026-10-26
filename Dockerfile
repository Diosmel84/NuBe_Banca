# syntax=docker/dockerfile:1
# Imagen de producción: Next 16 + Socket.io + job de vencimiento en un solo proceso Node.

FROM node:22-bookworm-slim AS base
# Prisma necesita OpenSSL en runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencias completas (para compilar) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- Build: Next + server.ts bundleado con esbuild ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Solo dependencias de producción ----
# Parte de `deps` (una sola descarga) y poda lo de desarrollo; el cliente Prisma ya generado se conserva.
FROM deps AS prod-deps
RUN npm prune --omit=dev && npm cache clean --force

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    STORAGE_DIR=/data
# Los comprobantes de pago van en /data: montar un volumen persistente ahí.
RUN mkdir -p /data && chown node:node /data

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json next.config.mjs ./
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/market').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migraciones pendientes antes de arrancar. `migrate deploy` es idempotente y no borra datos.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
