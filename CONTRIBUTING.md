# Contributing to Kite

Thanks for contributing to Kite.
This document explains how to set up your environment, how to prepare changes, and what is expected before opening a pull request.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Development Workflow](#development-workflow)
- [Quality Checks (Required Before Commit)](#quality-checks-required-before-commit)
- [Commit Message Convention (Conventional Commits)](#commit-message-convention-conventional-commits)
- [Pull Requests](#pull-requests)
- [Database and OpenAPI Changes](#database-and-openapi-changes)
- [Testing Guidance](#testing-guidance)
- [Documentation Changes](#documentation-changes)

## Code of Conduct

Be respectful and constructive in all project interactions.
Assume positive intent and focus feedback on code and outcomes.

## Prerequisites

- Node.js (recommended version compatible with this repository toolchain)
- `pnpm`
- Docker and Docker Compose (recommended for local infrastructure like Postgres/Redis)

## Local Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Start local database/services (recommended):

   ```bash
   ./scripts/start-local-db.sh
   ```

4. Start development server:

   ```bash
   pnpm dev
   ```

## Development Workflow

1. Create a topic branch from `develop` (or the default active integration branch):

   ```bash
   git checkout develop
   git pull
   git checkout -b feat/your-change
   ```

2. Implement your changes with focused scope.
3. Add/update tests where relevant.
4. Run all required checks before committing.
5. Write a Conventional Commit message.
6. Open a pull request with clear description and testing notes.

## Quality Checks (Required Before Commit)

Before each commit, run the following commands from the repository root:

```bash
pnpm check
pnpm format
pnpm lint
```

### Why these checks

- `pnpm check`: validates Svelte/TypeScript project correctness via `svelte-check`.
- `pnpm format`: applies repository formatting rules.
- `pnpm lint`: verifies formatting and ESLint rules.

If any command fails, fix issues before committing.

## Commit Message Convention (Conventional Commits)

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```text
type(scope): short summary
```

Optional body and footer may follow:

```text
type(scope): short summary

Longer explanation of what changed and why.

BREAKING CHANGE: describe the breaking behavior and migration path
```

### Common types

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation-only changes
- `refactor`: code change that neither fixes a bug nor adds a feature
- `test`: adding or updating tests
- `chore`: tooling/build/maintenance changes
- `ci`: CI/CD-related changes

### Examples

```text
feat(shares): add upload progress indicator for large files
fix(auth): handle expired reset token gracefully
docs(readme): clarify production docker profile usage
refactor(api): simplify share request validation flow
test(e2e): cover anonymous share request upload
chore(deps): update svelte-check to latest compatible version
```

### Breaking change examples

```text
feat(api): rename /shares endpoint to /v2/shares

BREAKING CHANGE: clients must migrate from /shares to /v2/shares
```

```text
refactor(db): normalize share permissions schema

BREAKING CHANGE: existing migrations are incompatible; run new migration plan
```

## Pull Requests

When opening a PR, include:

- A concise summary of the change
- Motivation/context (what problem it solves)
- Screenshots or recordings for UI changes (if applicable)
- Testing notes (commands run and outcomes)
- Any migration or rollout considerations

### PR Checklist

- [ ] Change is scoped and focused
- [ ] `pnpm check` passed
- [ ] `pnpm format` applied
- [ ] `pnpm lint` passed
- [ ] Tests added/updated where appropriate
- [ ] Commit messages follow Conventional Commits
- [ ] Documentation updated (if behavior/config changed)

## Database and OpenAPI Changes

If your PR modifies database schema or API surface:

- Database schema/migration:

  ```bash
  pnpm run db:generate
  pnpm run db:migrate
  ```

- OpenAPI changes:

  ```bash
  pnpm run openapi:generate
  ```

Commit generated artifacts that are expected to be versioned by the repository.

## Testing Guidance

Use the smallest relevant test scope first:

- Unit tests:

  ```bash
  pnpm run test:unit
  ```

- End-to-end tests:

  ```bash
  pnpm run test:e2e
  ```

- Full test flow:

  ```bash
  pnpm test
  ```

## Documentation Changes

Update documentation whenever you change:

- Setup/operational steps
- Configuration/env variables
- Public APIs or user-facing behavior
- Security-sensitive behavior or default settings

Keeping docs current is part of done.
