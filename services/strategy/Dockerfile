# Build stage
FROM node:20-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages ./packages
COPY services/strategy ./services/strategy

RUN pnpm install --frozen-lockfile --filter @dlmm-copilot/strategy...
RUN pnpm --filter @dlmm-copilot/core build
RUN pnpm --filter @dlmm-copilot/strategy build

# Runtime stage
FROM node:20-slim AS runtime
ENV NODE_ENV=production
RUN useradd -m -u 10001 nodeuser
WORKDIR /app

COPY --from=build /app/services/strategy/dist ./services/strategy/dist
COPY --from=build /app/services/strategy/package.json ./services/strategy/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER nodeuser
CMD ["node","services/strategy/dist/server.js"]
