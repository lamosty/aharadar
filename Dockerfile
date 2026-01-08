# Base stage with pnpm
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/llm/package.json ./packages/llm/
COPY packages/pipeline/package.json ./packages/pipeline/
COPY packages/queues/package.json ./packages/queues/
COPY packages/worker/package.json ./packages/worker/
COPY packages/api/package.json ./packages/api/
COPY packages/cli/package.json ./packages/cli/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY . .
RUN pnpm build

# Worker target
FROM base AS worker
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
CMD ["pnpm", "--filter", "@aharadar/worker", "start"]
