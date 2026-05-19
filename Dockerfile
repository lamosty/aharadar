# Base stage with pnpm
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/llm/package.json ./packages/llm/
COPY packages/pipeline/package.json ./packages/pipeline/
COPY packages/queues/package.json ./packages/queues/
COPY packages/queue-ui/package.json ./packages/queue-ui/
COPY packages/worker/package.json ./packages/worker/
COPY packages/codex-host/package.json ./packages/codex-host/
COPY packages/api/package.json ./packages/api/
COPY packages/cli/package.json ./packages/cli/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
ARG API_URL=http://localhost:3001
ARG API_PORT=3001
ENV API_URL=${API_URL}
ENV API_PORT=${API_PORT}
COPY --from=deps /root/.local/share/pnpm /root/.local/share/pnpm
COPY --from=deps /app/node_modules ./node_modules
# @why Keep package-level pnpm workspace links from the deps stage. Copying
# only `packages/*/node_modules` into `./packages/` flattens the destination
# and can leave final images with root deps but without a valid package tree.
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm clean && pnpm build
# @why Aharadar's production containers boot directly from these compiled
# entrypoints. Fail the image build if Docker caching or workspace layout ever
# produces an image that would restart-loop with MODULE_NOT_FOUND.
RUN for artifact in \
    packages/api/dist/main.js \
    packages/worker/dist/main.js \
    packages/web/.next/BUILD_ID; do \
      if [ ! -f "$artifact" ]; then \
        echo "missing build artifact: $artifact"; \
        find packages -maxdepth 3 \( -path '*/dist/main.js' -o -path '*/.next/BUILD_ID' \) -print; \
        exit 1; \
      fi; \
    done

# API target
FROM base AS api
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
CMD ["node", "packages/api/dist/main.js"]

# Migration target
FROM base AS migrate
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
CMD ["node", "packages/db/dist/migrate.js"]

# Web target
FROM base AS web
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
WORKDIR /app/packages/web
ENV NODE_ENV=production
CMD ["node", "node_modules/next/dist/bin/next", "start"]

# Worker target
FROM base AS worker
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
CMD ["node", "packages/worker/dist/main.js"]

# Queue UI target
FROM base AS queue-ui
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
CMD ["node", "packages/queue-ui/dist/index.js"]
