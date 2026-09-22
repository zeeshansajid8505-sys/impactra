# syntax=docker/dockerfile:1

# 1. Base stage with pinned Node.js 24.21.0 Alpine and pnpm 12.3.4
FROM node:24.21.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 2. Builder stage: Complete workspace source with native container dependency resolution
FROM base AS builder
WORKDIR /app

# Copy repository manifests, workspace configurations, and source code
# (.dockerignore ensures host node_modules, .next, .turbo, and docs are completely excluded)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies inside Linux container with strict lockfile
RUN pnpm install --frozen-lockfile

# Build environment configuration
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js standalone application via Turborepo
RUN pnpm --filter @impactra/web... build

# 3. Production runner stage: Minimal Alpine runtime with standalone output
FROM node:24.21.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output, static assets, and public assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
