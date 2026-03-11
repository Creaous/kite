# 🪁 Kite

![Current Release](https://git.codeguilds.org/Mitchell/kite/badges/release.svg "Current Release")
![Tests Workflow](https://git.codeguilds.org/Mitchell/kite/badges/workflows/tests.yml/badge.svg "Tests Workflow")
![Open Issues](https://git.codeguilds.org/Mitchell/kite/badges/issues/open.svg "Open Issues")
![Open Pull Requests](https://git.codeguilds.org/Mitchell/kite/badges/pulls/open.svg "Open Pull Requests")

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

## Official Repositories

The only official repositories for Kite are on:

- [CodeGuilds](https://git.codeguilds.org/Mitchell/kite) - main
- [GitHub](https://github.com/Creaous/kite) - mirror
- Codeberg (coming soon) - mirror

Docker images will only be published on CodeGuilds.

## Documentation

Documentation is available in the `docs/` folder, [here](docs/README.md).
