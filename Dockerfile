# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Native build tools needed for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer-caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# Prune to production deps only
RUN npm prune --production

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
# Official Playwright image ships Chromium + all system dependencies
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime

WORKDIR /app

# Copy compiled output and production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
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
