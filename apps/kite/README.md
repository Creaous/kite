# 🪁 Kite

Kite is a self-hosted file-sharing application built with SvelteKit and PostgreSQL (Drizzle ORM).
It provides secure, link-based shares, share requests, admin controls, and an API for integrations.

## Quick Overview

- Create password-protected, expiring share links with download limits.
- Upload files and folders (per-file progress, deduplication, ZIP download).
- Create and manage share requests where third parties can upload files.
- Authentication: email/password, optional passkeys, and anonymous flows.
- Admin UI: user management, branding, impersonation, and app settings.
- REST API with OpenAPI generation for external integrations.
- High sensitivity shares: Delete files within 60 seconds after deletion or expiry.

## Tech Stack

- SvelteKit (frontend & server routes)
- TailwindCSS + DaisyUI
- PostgreSQL + Drizzle ORM
- BullMQ + Redis (background jobs)
- OpenAPI (auto-generated)
- Vitest + Playwright for tests

## Requirements

- Node.js (recommended v18+ or compatible with the repo tooling)
- pnpm (or npm/yarn) for installing dependencies
- Docker & Docker Compose (recommended for local DB/Redis in development)

## Local Development (fast start)

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment sample and set values (create `.env`):

   ```bash
   cp .env.example .env
   # edit .env for DB, REDIS, DRIZZLE_GATEWAY, etc.
   ```

3. Start local DB services with Docker (recommended):

   ```bash
   ./scripts/start-local-db.sh   # optional helper script
   ```

4. Run the app in dev mode:

   ```bash
   pnpm dev
   ```

The site will be available at `http://localhost:5173` (or the port `vite` reports).

## Database & Migrations

- Migrations are managed with `drizzle-kit`. Migration files live in the `drizzle/` folder.
- Common commands (see `package.json` scripts):
  - `pnpm run db:migrate` — run migrations
  - `pnpm run db:generate` — generate migration from schema
  - `pnpm run db:push` — push schema changes

The app runs `scripts/migrate.mjs` during container startup when applicable.

## Running in Docker

- Development infra only (Postgres + Redis):

  ```bash
  docker compose up -d
  ```

- Production env setup:

  ```bash
  cp .env.prod.example .env
  # edit .env and replace all CHANGE_ME_* values before first start
  ```

- Production stack (app + worker + db + redis):

  ```bash
  docker compose -f docker-compose.prod.yml up --build -d
  ```

Notes:

- `docker-compose.yml` is now development-only (DB + Redis).
- `docker-compose.prod.yml` is the production stack.
- Drizzle Gateway in production compose is opt-in via `--profile ops` and requires `DRIZZLE_GATEWAY_MASTERPASS`.
- Gateway defaults to `http://localhost:4983` (override with `DRIZZLE_GATEWAY_PORT`).
- Required prod vars include: `DATABASE_URL`, `ORIGIN`, and `POSTGRES_PASSWORD`.

SMTP for share request emailing:

- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.
- If SMTP is not configured, the share request email endpoint returns `503`.

## Scripts

Key scripts are exposed in `package.json`:

- `pnpm dev` — start dev server (Vite + SvelteKit)
- `pnpm build` — build for production
- `pnpm start` — run built app
- `pnpm test` — run unit & e2e tests (`vitest` + `playwright`)
- `pnpm run openapi:generate` — regenerate OpenAPI spec
- `pnpm run worker` — start the background worker process
- `pnpm run prod:up` — start production compose stack
- `pnpm run prod:up:worker` — start production compose stack with worker profile

## Testing

- Unit tests: `pnpm run test:unit`
- End-to-end: `pnpm run test:e2e` (requires Playwright and browsers installed)

## OpenAPI

The project generates an OpenAPI spec (see `scripts/generate-openapi.mjs`). The generated spec is available under `static/openapi.json` and `build/client/openapi.json` after build.

## Contributing

- Follow the existing code style (Prettier + ESLint + Tailwind order plugin).
- Run `pnpm format` and `pnpm lint` before submitting PRs.

## Troubleshooting

- If migrations fail, inspect `drizzle/` and the migration logs from `scripts/migrate.mjs`.
- Use `docker compose logs` to inspect services (db, redis, worker).
