# Build stage
FROM node:20-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot

RUN pnpm install --frozen-lockfile --filter @dlmm-copilot/bot...
RUN pnpm --filter @dlmm-copilot/core build
RUN pnpm --filter @dlmm-copilot/bot build || true

# Runtime stage
FROM node:20-slim AS runtime
ENV NODE_ENV=production
RUN useradd -m -u 10001 nodeuser
WORKDIR /app

COPY --from=build /app/apps/bot/dist ./apps/bot/dist
COPY --from=build /app/apps/bot/src ./apps/bot/src
COPY --from=build /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:4001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER nodeuser
CMD ["node","apps/bot/dist/index.js"]
