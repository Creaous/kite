# 🪁 Kite

Kite is a simple to use file sharing platform that allows you to create and request shares. It is built with SvelteKit and PostgreSQL, designed to be easy to use and self-hosted.

## Features

- Create secure file shares with optional title, message, password, expiration date, and download limits.
- Upload both files and folders with a tree view, per-file progress, and deduplicated upload handling.
- Generate public share links (`/s/{code}`) with password unlock, file-by-file downloads, and ZIP download support.
- Manage existing shares (view stats, copy links, edit metadata/settings, and delete shares).
- Create share requests (`/r/{code}`) with requester details, message, and expiration.
- Manage share requests from the dashboard (list, edit, delete, copy request links, and track status).
- Respond to share requests by uploading files directly from public request pages.
- Use built-in authentication with email/password plus optional passkey and anonymous flows.
- Admin panel for user management (search users, role updates, suspend/unsuspend, impersonation).
- Admin branding controls for app name, tagline, and logo.
- REST API for shares, share requests, uploads, tokens, and admin operations, with OpenAPI generation.
- Internationalization support via Paraglide and localized UI messages.

## Technologies

- TailwindCSS for styling and responsive design
- DaisyUI for UI components
- Iconify for icons
- SvelteKit for rendering and routing
- PostgreSQL w/ Drizzle ORM for database
- OpenAPI for API documentation
- Vitest for testing

## Docker

- Build and start core services:

  ```bash
  docker compose up --build
  ```

- Start app + db + redis + worker:

  ```bash
  docker compose --profile worker up --build
  ```

Notes:

- The app runs Drizzle migrations on startup (`scripts/migrate.mjs`).
- Migration files are expected in `drizzle/`.
- The worker runs `scripts/worker.mjs` and schedules recurring BullMQ maintenance jobs.
- Drizzle Gateway is included in compose and requires `DRIZZLE_GATEWAY_MASTERPASS` to be set.
- Gateway runs at `http://localhost:4983` by default (override with `DRIZZLE_GATEWAY_PORT`).
