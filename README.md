# Kite Monorepo

This repository is a pnpm workspace managed by Turborepo.

## Workspace layout

- `apps/kite` — main Kite SvelteKit application
- `packages/emails` — Maizzle email templates for Kite
- `packages/eslint-config` — shared ESLint configuration
- `packages/typescript-config` — shared TypeScript configuration

## Commands

Run from the repository root:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm check
```

Run a command for one package:

```bash
pnpm --filter kite dev
pnpm --filter kite-emails build
```

## Notes

- `apps/web` and `apps/docs` were removed from this monorepo.
- App-specific setup and runtime docs are in `apps/kite/README.md`.
