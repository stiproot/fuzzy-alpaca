# fuzzy-alpaca-core — runs TypeScript directly via tsx (no build step).
# Stage 1: production dependencies + tsx (the only dev tool needed at runtime).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@^4.23.0

# Stage 2: runtime.
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Non-root (uid in the conventional container range)
RUN useradd --system --uid 1001 appuser
USER appuser

EXPOSE 3000
# Config comes from the environment (Dapr secret store, k8s env, compose env),
# read once at boot by AppConfig — no --env-file in the container.
CMD ["node", "--import", "tsx", "src/index.ts"]
