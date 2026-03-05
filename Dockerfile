# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Native build tools needed for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install ALL deps (needed for TypeScript build)
COPY package.json package-lock.json* ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# ─── Stage 1b: Production deps ───────────────────────────────────────────────
# Fresh install with only production deps — much faster than npm prune
FROM node:24-bookworm-slim AS prod-deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
# Official Playwright image ships Chromium + all system dependencies
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime

WORKDIR /app

# Copy compiled output and production node_modules from separate stages
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user for security
RUN groupadd --gid 10001 appgroup && \
    useradd --uid 10001 --gid appgroup --shell /bin/bash --create-home appuser && \
    chown -R appuser:appgroup /app
USER appuser

# Health status file lives in /tmp (writable by non-root)
ENV NODE_ENV=production \
    LOG_LEVEL=info

CMD ["node", "dist/main.js"]
