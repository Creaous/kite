FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app
RUN addgroup -S app \
	&& adduser -S -u 10001 -G app app

COPY --from=build --chown=app:app /app/build ./build
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/drizzle ./drizzle

RUN mkdir -p /app/uploads /tmp && chown -R app:app /app/uploads /tmp

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "scripts/start-app.mjs"]
