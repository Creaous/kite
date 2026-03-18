# Architecture

This page captures the high-level architecture of Kite and how requests move through the system.

## Request Flow

1. Browser/API client calls the SvelteKit app.
2. Global server hooks run in order:
   - i18n middleware
   - public API availability gate
   - auth/session resolution
   - request logging + request ID propagation
   - security response headers
3. Route handlers call service-layer code in `src/lib/server/services/*`.
4. Services use Drizzle ORM against PostgreSQL and queue background work in Redis/BullMQ when needed.
5. Responses are returned with security headers and request ID.

## Auth Boundaries

- Public endpoints live under `/api/v1/public/*` and provide controlled unauthenticated access.
- Auth endpoints live under `/api/auth/*` (Better Auth handler).
- Authenticated user endpoints require a session.
- Admin endpoints require role `admin` and reject normal users.
- Public API can be globally disabled by auth settings, with explicit whitelist exceptions.

## Data and Ownership

- PostgreSQL stores users, sessions, shares, uploads, tokens, and settings.
- Redis is used for background maintenance queues and scheduling.
- Uploaded file blobs are stored on disk and tracked by DB metadata.
- Share/download operations enforce expiry, password, and download-limit rules.

## Background Jobs

The worker process runs recurring maintenance jobs:

- Expire unused uploads
- Expire old shares
- Remove unreferenced files from disk when possible

BullMQ schedulers define intervals via environment variables and run with conservative retry/backoff settings.

## Runtime Components

- App server: SvelteKit Node adapter
- Worker: BullMQ worker process
- Database: PostgreSQL
- Queue/cache: Redis/Dragonfly
- Optional operational component: Drizzle Gateway

## Deployment Guardrails

- Run DB migrations at startup (unless explicitly disabled).
- Verify environment and connectivity with `pnpm predeploy:check`.
- CI includes migration freshness checks and test execution.
