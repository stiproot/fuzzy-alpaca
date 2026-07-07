# fuzzy-alpaca-core gateway — Bun runs TypeScript directly (no build, no tsx).
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# oven/bun ships a non-root `bun` user
USER bun

EXPOSE 3000
# Config comes from the environment (Dapr secret store / k8s / compose) — Bun
# would auto-load a .env if present, but production ships none.
CMD ["bun", "src/index.ts"]
