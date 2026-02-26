# ─── Stage 1: Install dependencies ───────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests, npmrc, and patches
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/
# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ─────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build client (Vite) and server (esbuild)
RUN pnpm build

# ─── Stage 3: Production runtime ────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install Playwright/Chromium system dependencies
# These are required for the fetcher engine's browser automation
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests, npmrc, patches, and install production-only dependencies
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy built artifacts
COPY --from=build /app/dist ./dist

# Copy Drizzle migrations
COPY --from=build /app/dist/drizzle ./drizzle

# Non-root user for security
RUN addgroup --system --gid 1001 titan && \
    adduser --system --uid 1001 titan

# Give titan user access to Playwright browser cache
RUN mkdir -p /home/titan/.cache && chown -R titan:titan /home/titan

USER titan

# Railway injects PORT; default to 5000
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.js"]
