# syntax=docker/dockerfile:1

# 1. Base stage with pinned Node.js 24.21.0 Alpine and pnpm 12.3.4
FROM node:24.21.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 2. Builder stage
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install all dependencies with strict lockfile
RUN pnpm install --frozen-lockfile

# Build database workspace package and generate Prisma Client
RUN pnpm --filter @impactra/database build

# Build NestJS API
RUN pnpm --filter @impactra/api build

# 3. Production runner stage
FROM node:24.21.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy root workspace and built files
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
