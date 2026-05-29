# syntax=docker/dockerfile:1.7
# Multi-stage build for the wa-bridge sidecar. Builds the engine package
# (workspace dep) once, then runs the bridge with tsx so we don't need a
# separate emit step. Auth state is persisted to /data/wa-auth — mount a
# volume there in production or you'll re-pair on every restart.

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack disable && npm i -g bun@1

# ---------------- deps ----------------
FROM base AS deps
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/wa-bridge/package.json ./apps/wa-bridge/
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/validators/package.json ./packages/validators/
RUN bun install --frozen-lockfile

# ---------------- runtime ----------------
FROM deps AS runner
COPY packages ./packages
COPY apps/wa-bridge ./apps/wa-bridge
ENV NODE_ENV=production \
    BRIDGE_AUTH_DIR=/data/wa-auth \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=3001
EXPOSE 3001
VOLUME ["/data/wa-auth"]
WORKDIR /app/apps/wa-bridge
CMD ["bun", "run", "start"]
