FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/kite/package.json ./apps/kite/package.json
COPY packages/emails/package.json ./packages/emails/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm --filter kite run build
RUN pnpm --filter emails run build
RUN CI=true pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV EMAIL_TEMPLATES_DIR=/app/emails
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV CI=true

WORKDIR /app
RUN addgroup -S app \
	&& adduser -S -u 10001 -G app app

COPY --from=build --chown=app:app /workspace/apps/kite/build ./build
COPY --from=build --chown=app:app /workspace/node_modules ./node_modules
COPY --from=build --chown=app:app /workspace/apps/kite/package.json ./package.json
COPY --from=build --chown=app:app /workspace/apps/kite/scripts ./scripts
COPY --from=build --chown=app:app /workspace/apps/kite/drizzle ./drizzle
COPY --from=build --chown=app:app /workspace/packages/emails/build_production ./emails

RUN test -f /app/emails/share-request.html

RUN mkdir -p /app/uploads /tmp && chown -R app:app /app/uploads /tmp

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "scripts/start-app.mjs"]
