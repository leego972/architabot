# ─── Stage 1: Install dependencies ───────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ─────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build client (Vite) and server (esbuild)
RUN pnpm build

# ─── Stage 3: Production runtime ────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests and install production-only dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /app/dist ./dist

# Copy Drizzle migrations
COPY --from=build /app/dist/drizzle ./drizzle

# Non-root user for security
RUN addgroup --system --gid 1001 titan && \
    adduser --system --uid 1001 titan
USER titan

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-5000}/api/health || exit 1

# Railway injects PORT; default to 5000
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.js"]
