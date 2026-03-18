# Deployment

Deploying Kite is designed to be extremely easy!

## Local Development

### Requirements

- Node.js (recommended v18+ or compatible with the repo tooling)
- pnpm (possibly npm/yarn) for installing dependencies
- Docker & Docker Compose (recommended for local DB/Redis in development)

### Setup

1. Install dependencies and enter the Kite app directory:

   ```bash
   pnpm install
   cd apps/kite
   ```

2. Copy environment sample and set values (create `.env`):

   ```bash
   cp .env.example .env
   # edit .env for DB, REDIS, DRIZZLE_GATEWAY, etc.
   ```

3. Start local DB services with Docker (recommended):

   ```bash
   docker compose up -d
   ```

   or start the full local stack with readiness checks:

   ```bash
   pnpm dev:stack
   ```

4. Run the app in dev mode:

   ```bash
   pnpm dev
   ```

The site will be available at `http://localhost:5173` (or the port `vite` reports).

## Production Environment

While you can build Kite in production mode and deploy the server manually, it is recommended to use Docker.

### Notes

- Drizzle Gateway in production compose is opt-in via `--profile ops` and requires `DRIZZLE_GATEWAY_MASTERPASS`.
- Gateway defaults to `http://localhost:4983` (override with `DRIZZLE_GATEWAY_PORT`).
- You can safely remove the Drizzle Gateway if you are sure that you will not be needing to access the database.
- Required prod vars include: `DATABASE_URL`, `ORIGIN`, and `POSTGRES_PASSWORD`.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` for SMTP emailing.

### Requirements

- Docker & Docker Compose

### Setup

1. Grab the latest Docker Compose file:

   ```bash
   curl -o docker-compose.yml https://git.codeguilds.org/Mitchell/kite/raw/develop/apps/kite/docker-compose.prod.yml
   ```

2. Grab the latest environment sample:

   ```bash
   curl -o .env https://git.codeguilds.org/Mitchell/kite/raw/develop/apps/kite/.env.example
   # update it too with your correct variables
   ```

3. Start up the production stack:

   ```bash
   docker compose up -d
   ```

4. Run pre-deploy validation checks before exposing traffic:

   ```bash
   pnpm predeploy:check
   ```

The site will be available at `http://localhost:3000` (or the port you specified).
