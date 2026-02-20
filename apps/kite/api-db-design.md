## Kite — API and Database Design

This document describes a suggested API structure, request/response DTOs, and a relational database layout for the Kite project. It follows a resource-oriented REST style, thin route adapters, and a service layer that encapsulates business logic and transactions.

---

**Contents**

- Overview
- API Design (routes, request/response examples)
- DTOs and common patterns
- Database schema (tables, enums, indexes)
- Migration & data-migration notes
- Background jobs and maintenance
- Security & operational notes
- Next steps

---

## Overview

- Base path: `/api/v1` for authenticated and administrative APIs.
- Public share access endpoints under `/s/:code` and `/r/:code` (share requests).
- Routes are thin adapters: validate input, call service layer, return standardized responses.
- Responses follow the envelope: `{ data?: ..., meta?: ..., error?: { code, message } }`.
- Business logic, DB transactions, and scheduling live in `src/lib/server/services/*`.

## API Design

Principles

- Resource-oriented routes (uploads, shares, share-requests, tokens).
- Idempotency for create operations (use `fingerprint` or idempotency keys).
- Chunked/resumable uploads via PATCH with `Content-Range`.
- Short-lived download tokens for public access.

Standard response envelope

Success (200/201)

{
"data": { ... },
"meta": { ... }
}

Error (4xx/5xx)

{
"error": { "code": "INVALID_INPUT", "message": "..." }
}

Auth

- POST `/api/v1/auth/sign-in`
  - Request: `{ "email": string, "password": string }`
  - Response 200: `{ data: { accessToken, refreshToken?, user: { id, name, email, isAnonymous } } }`
- POST `/api/v1/auth/refresh`
  - Request: `{ "refreshToken": string }`

Uploads

- POST `/api/v1/uploads` — Initiate an upload (idempotent by `fingerprint`).
  - Request:
    {
    "filename": "photo.jpg",
    "size": 5324800,
    "fingerprint": "name-size-chunks",
    "chunkSize": 5242880
    }
  - Response 201:
    {
    "data": {
    "uploadId": "u_abc123",
    "fingerprint": "name-size-chunks",
    "status": "pending",
    "chunkSize": 5242880,
    "uploadedBytes": 0,
    "expiresAt": "2026-02-12T12:00:00Z"
    }
    }

- PATCH `/api/v1/uploads/:uploadId` — Upload chunk (raw body)
  - Header: `Content-Range: bytes start-end/total`
  - Response 200:
    `{ "data": { "uploadId", "uploadedBytes", "status": "uploading" } }`

- POST `/api/v1/uploads/:uploadId/status` — finalize/cancel
  - Request: `{ "action": "finalize" | "cancel" }`
  - Finalize response 200:
    `{ "data": { "uploadId", "status": "processing|ready", "hash"?, "storagePath"? } }`

Shares

- POST `/api/v1/shares` — Create a share (transactional)
  - Request:
    {
    "title": "Vacation photos",
    "expiresAt": "2026-03-01T00:00:00Z",
    "password": "hunter2",
    "uploads": [{ "uploadId": "u_abc123", "name": "beach.jpg" }],
    "allowDownload": true
    }
  - Response 201:
    {
    "data": {
    "shareId": "s_xyz987",
    "code": "X7K3Q",
    "title": "Vacation photos",
    "passwordProtected": true,
    "uploads": [{ "id": "u_abc123", "name": "beach.jpg", "size": 5324800 }],
    "expiresAt": "2026-03-01T00:00:00Z",
    "downloadCount": 0
    }
    }

- GET `/api/v1/shares/:shareId` — Retrieve share (includes uploads)
  - Response 200: same structure as create.

- DELETE `/api/v1/shares/:shareId` — Soft-delete (204)

Public share access

- GET `/s/:code` — View public share metadata (password not returned)
  - Query param: `?password=...` (optional for initial access)
  - Response: `{ data: { code, title, uploads, expiresAt?, requiresPassword } }`

- POST `/s/:code/download` — Obtain short-lived download token (public or password-protected)
  - Request: `{ "password"?: string }`
  - Response 200:
    `{ "data": { "token": "t_..", "downloadUrls": [{ uploadId, url }] } }`

Share requests

- POST `/api/v1/share-requests` — Create a request (allow anonymous)
  - Request:
    {
    "title": string,
    "message"?: string,
    "expiresAt"?: string,
    "requester": { "name"?: string, "email"?: string }
    }
  - Response 201: `{ data: { requestId, code, title, expiresAt } }`

- POST `/r/:code/respond` — Respond to a request with uploads
  - Request: `{ uploads: [{ uploadId }] }`
  - Response 200: `{ data: { shareId } }` (service creates a share attaching uploads)

Tokens

- POST `/api/v1/tokens` — Create generic short-lived token
  - Request: `{ subject: string, purpose: "download", expiresInSec: number }`
  - Response 201: `{ data: { token, expiresAt } }`

Admin

- GET `/api/v1/admin/uploads?status=processing` — paginated listing
- POST `/api/v1/admin/migrate-upload` — immediate background job to move storage

Common patterns

- All create endpoints are idempotent when possible.
- Input validation via Zod schemas in adapters; services receive already-validated DTOs.
- Services handle transactions and schedule Graphile Worker jobs.

## DTOs and Examples

- Upload DTO (initiate)
  - Request: `CreateUploadDTO`

    {
    "filename": "string",
    "size": number,
    "fingerprint": "string",
    "chunkSize": number
    }

  - Response: `UploadResponse`

    {
    "uploadId": string,
    "filename": string,
    "size": number,
    "chunkSize": number,
    "uploadedBytes": number,
    "status": "pending|uploading|processing|ready|failed|cancelled",
    "expiresAt": string
    }

- ShareCreateDTO

  {
  "title": string,
  "expiresAt"?: string,
  "password"?: string,
  "uploads": [{ "uploadId": string, "name"?: string }],
  "allowDownload": boolean
  }

## Database Schema

Use Postgres with Drizzle ORM schema files. Below is the recommended relational layout and enum definitions.

Enums

- `upload_status`: `('pending','uploading','processing','ready','failed','cancelled')`
- `share_status`: `('active','expired','deleted')`
- `request_status`: `('open','fulfilled','expired','deleted')`

Tables

1. `users`

- `id` uuid PK
- `email` text UNIQUE NULLABLE
- `name` text
- `is_anonymous` boolean default false
- `created_at`, `updated_at`

2. `uploads`

- `id` uuid PK
- `fingerprint` text NOT NULL
- `filename` text
- `size` bigint NOT NULL
- `mime_type` text
- `chunk_size` integer
- `uploaded_bytes` bigint default 0
- `status` upload_status NOT NULL DEFAULT 'pending'
- `storage_provider` text (s3|local|gcs)
- `storage_path` text
- `hash` text NULLABLE
- `uploaded_by` uuid FK -> users(id)
- `created_at`, `updated_at`, `deleted_at` (soft delete)

Indexes and constraints:

- UNIQUE (fingerprint, uploaded_by) — deduplication per-user
- INDEX on (uploaded_by)
- INDEX on (status)
- PARTIAL INDEX (`deleted_at` IS NULL)

3. `shares`

- `id` uuid PK
- `code` text UNIQUE NOT NULL -- short human code
- `title` text
- `password_hash` text NULLABLE
- `password_protected` boolean DEFAULT false
- `expires_at` timestamptz NULLABLE
- `status` share_status DEFAULT 'active'
- `created_by` uuid FK -> users(id)
- `download_count` integer DEFAULT 0
- `created_at`, `updated_at`, `deleted_at`

Indexes:

- UNIQUE on `code`
- INDEX on `expires_at`
- INDEX on `created_by`

4. `share_upload` (join table)

- `id` uuid PK
- `share_id` uuid FK -> shares(id) ON DELETE CASCADE
- `upload_id` uuid FK -> uploads(id) ON DELETE RESTRICT
- `filename_override` text NULLABLE
- `size_snapshot` bigint (copy of upload.size when attached)
- `created_at`
- UNIQUE (share_id, upload_id)

5. `share_requests`

- `id` uuid PK
- `code` text UNIQUE
- `title` text
- `message` text
- `requester_name` text NULLABLE
- `requester_email` text NULLABLE
- `expires_at` timestamptz NULLABLE
- `status` request_status DEFAULT 'open'
- `created_by` uuid NULLABLE
- `created_at`, `updated_at`, `deleted_at`

Indexes: status, expires_at

6. `token_store`

- `token` text PK
- `subject` text (uploadId|shareId|userId)
- `purpose` text
- `expires_at` timestamptz NOT NULL
- `used` boolean default false
- `created_at`

Indexes: `expires_at` (for cleanup), unique on `token`

7. `audit_log`

- `id` bigserial PK
- `actor_id` uuid NULLABLE
- `action` text
- `resource_type` text
- `resource_id` text
- `payload` jsonb
- `created_at` timestamptz DEFAULT now()

Index: `(resource_type, resource_id)`

Schema notes & constraints

- Use DB enums for status columns to guarantee valid values.
- Prefer `ON DELETE CASCADE` for `share_upload.share_id` but `ON DELETE RESTRICT` for `upload_id` to avoid accidental file deletion when shares are removed.
- Use `deleted_at` (soft delete) for main resources; add partial indexes for active rows to optimize queries.
- Maintain counters such as `download_count` within the transaction that logs the download event to avoid expensive COUNT(\*) on read.

Indexes & performance recommendations

- `uploads(fingerprint, uploaded_by)` unique index for deduplication.
- `uploads(status)` index for processing pipelines.
- `shares(code)` unique index for quick lookup.
- `token_store(expires_at)` TTL index for efficient cleanup.
- Materialized views for dashboard/analytics, refreshed by worker jobs.

Migration plan

1. Add enums (upload_status, share_status, request_status) via migration.
2. Add `deleted_at` columns and partial indexes.
3. Add unique/index constraints such as `(fingerprint, uploaded_by)`.
4. For any existing string status columns: backfill new enum columns and swap references.
5. For `license.isActive` (if present) perform phased migration: add boolean, backfill, switch code paths, drop old column.

Use `drizzle` migrations (see `drizzle/` folder) and batch updates for large tables.

Background jobs & maintenance

- Graphile Worker tasks (in `tasks/`):
  - `expireShare` — expire + archive shares where `expires_at < now()`.
  - `expireShareRequest` — expire old requests.
  - `expireUnusedFiles` — orphan cleanup for `uploads` not attached to shares and older than retention window.
  - `refreshMaterializedViews` — refresh heavy aggregations used by admin dashboards.

- Scheduling: services should schedule jobs (addJob) when creating/updating resources; route adapters should not call worker APIs directly.

Security & operational

- Passwords: store `password_hash` using Argon2; never return hashes in API responses.
- Download tokens: short TTL (5–15 minutes) and optional single-use (`used` flag).
- Rate limit public endpoints (`/s/:code`, chunk uploads).
- Audit important actions into `audit_log` (share creation, deletion, password changes, download token issuance).

Next steps & suggested repo changes

- Add a `src/lib/server/services/` directory with `share.ts`, `upload.ts`, `token.ts` implementing transactional logic and worker scheduling.
- Create a Drizzle migration SQL file to add enums and indexes (place under `drizzle/` as new migration).
- Add `docs/api-db-design.md` (this file) to the repository and link it from the project README.

If you'd like, I can now:

- generate a service example `src/lib/server/services/share.ts` and refactor one route adapter,
- or produce a Drizzle migration SQL snippet for enums and indexes.

---

Document created: `docs/api-db-design.md`
