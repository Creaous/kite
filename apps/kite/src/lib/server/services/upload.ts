import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../db';
import { uploads } from '../db/schema';

function getLocalUploadsDir() {
	return join(process.cwd(), 'uploads');
}

function getLocalUploadPath(uploadId: string) {
	return join(getLocalUploadsDir(), `${uploadId}.bin`);
}

/**
 * Initiate an upload record. Enforces idempotency by fingerprint + uploadedBy.
 */
export async function initiateUpload(dto: {
	filename: string;
	relativePath?: string | null;
	size: number;
	fingerprint: string;
	chunkSize?: number;
	uploadedBy?: string | null;
	shareId?: string | null;
	shareRequestId?: string | null;
	highSensitivity?: boolean;
}) {
	const {
		filename,
		relativePath,
		size,
		fingerprint,
		chunkSize = undefined,
		uploadedBy = null,
		highSensitivity = false
	} = dto;
	const normalizedRelativePath = relativePath ?? null;

	if (!filename || !size || !fingerprint) throw new Error('Missing required upload parameters');

	if (!highSensitivity) {
		// Try to find existing uploads (idempotency / dedupe by content)
		const whereClause = and(
			eq(uploads.fingerprint, fingerprint),
			uploadedBy ? eq(uploads.uploadedBy, uploadedBy) : isNull(uploads.uploadedBy),
			eq(uploads.highSensitivity, false),
			isNull(uploads.deletedAt)
		);

		const existingUploads = await db
			.select()
			.from(uploads)
			.where(whereClause)
			.orderBy(desc(uploads.createdAt))
			.limit(25);

		const samePathExisting = existingUploads.find(
			(existing) =>
				existing.filename === filename &&
				(existing.relativePath ?? null) === normalizedRelativePath &&
				Number(existing.size ?? 0) === size
		);

		if (samePathExisting) {
			return {
				uploadId: samePathExisting.id,
				fingerprint: samePathExisting.fingerprint,
				status: samePathExisting.status,
				chunkSize: samePathExisting.chunkSize,
				uploadedBytes: Number(samePathExisting.uploadedBytes ?? 0),
				deduplicated: samePathExisting.status === 'ready'
			};
		}

		const reusableReady = existingUploads.find(
			(existing) => existing.status === 'ready' && Boolean(existing.storagePath)
		);

		if (reusableReady) {
			const [createdFromExisting] = await db
				.insert(uploads)
				.values({
					fingerprint,
					filename,
					relativePath: normalizedRelativePath,
					size,
					mimeType: reusableReady.mimeType,
					chunkSize: chunkSize ?? reusableReady.chunkSize,
					uploadedBytes: Number(reusableReady.uploadedBytes ?? size),
					status: 'ready',
					storageProvider: reusableReady.storageProvider,
					storagePath: reusableReady.storagePath,
					hash: reusableReady.hash,
					uploadedBy: uploadedBy ?? null,
					highSensitivity: false
				})
				.returning();

			return {
				uploadId: createdFromExisting.id,
				fingerprint: createdFromExisting.fingerprint,
				status: createdFromExisting.status,
				chunkSize: createdFromExisting.chunkSize,
				uploadedBytes: Number(createdFromExisting.uploadedBytes ?? 0),
				deduplicated: true
			};
		}
	}

	const [created] = await db
		.insert(uploads)
		.values({
			fingerprint,
			filename,
			relativePath: normalizedRelativePath,
			size,
			chunkSize: chunkSize ?? null,
			uploadedBytes: 0,
			status: 'pending',
			uploadedBy: uploadedBy ?? null,
			highSensitivity
		})
		.returning();

	return {
		uploadId: created.id,
		fingerprint: created.fingerprint,
		status: created.status,
		chunkSize: created.chunkSize,
		uploadedBytes: Number(created.uploadedBytes ?? 0),
		deduplicated: false
	};
}

type UploadActor = {
	userId: string;
	isAdmin?: boolean;
};

function assertActorCanAccessUpload(upload: { uploadedBy: string | null }, actor?: UploadActor) {
	if (!actor) {
		return;
	}

	if (!upload.uploadedBy || upload.uploadedBy !== actor.userId) {
		throw new Error('Forbidden upload access');
	}
}

/**
 * Append a chunk by updating uploadedBytes. Storage handling is left to provider integration.
 */
export async function appendChunk(uploadId: string, chunk: ArrayBuffer, actor?: UploadActor) {
	const byteLength = chunk.byteLength;
	const [existing] = await db
		.select({ id: uploads.id, storagePath: uploads.storagePath, uploadedBy: uploads.uploadedBy })
		.from(uploads)
		.where(eq(uploads.id, uploadId))
		.limit(1);

	if (!existing) throw new Error('Upload not found');

	assertActorCanAccessUpload(existing, actor);

	const storagePath = existing.storagePath ?? getLocalUploadPath(uploadId);
	await fs.mkdir(getLocalUploadsDir(), { recursive: true });
	await fs.appendFile(storagePath, Buffer.from(chunk));

	const [updated] = await db
		.update(uploads)
		.set({
			uploadedBytes: sql`${uploads.uploadedBytes} + ${byteLength}`,
			status: 'uploading',
			storageProvider: 'local',
			storagePath
		})
		.where(eq(uploads.id, uploadId))
		.returning({ id: uploads.id, uploadedBytes: uploads.uploadedBytes, status: uploads.status });

	if (!updated) throw new Error('Upload not found');

	return {
		uploadId: updated.id,
		uploadedBytes: Number(updated.uploadedBytes ?? 0),
		status: updated.status
	};
}

/**
 * Finalize or cancel an upload. Finalize moves status to processing then ready.
 */
export async function finalizeUpload(
	uploadId: string,
	action: 'finalize' | 'cancel',
	actor?: UploadActor
) {
	const [existing] = await db
		.select({ id: uploads.id, uploadedBy: uploads.uploadedBy, storagePath: uploads.storagePath })
		.from(uploads)
		.where(eq(uploads.id, uploadId))
		.limit(1);

	if (!existing) throw new Error('Upload not found');

	assertActorCanAccessUpload(existing, actor);

	if (action === 'cancel') {
		if (existing.storagePath) {
			await fs.rm(existing.storagePath, { force: true }).catch(() => undefined);
		}

		const [cancelled] = await db
			.update(uploads)
			.set({ status: 'cancelled', storagePath: null })
			.where(eq(uploads.id, uploadId))
			.returning();
		if (!cancelled) throw new Error('Upload not found');
		return { uploadId: cancelled.id, status: cancelled.status };
	}

	const [processing] = await db
		.update(uploads)
		.set({ status: 'processing' })
		.where(eq(uploads.id, uploadId))
		.returning();
	if (!processing) throw new Error('Upload not found');

	const [ready] = await db
		.update(uploads)
		.set({ status: 'ready' })
		.where(eq(uploads.id, uploadId))
		.returning();

	return { uploadId: ready.id, status: ready.status };
}

export async function listUploads(filters?: {
	status?: 'pending' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled' | 'all';
	limit?: number;
	offset?: number;
}) {
	const limit = Math.max(1, Math.min(filters?.limit ?? 50, 200));
	const offset = Math.max(0, filters?.offset ?? 0);

	const whereClause =
		filters?.status && filters.status !== 'all'
			? and(eq(uploads.status, filters.status), isNull(uploads.deletedAt))
			: isNull(uploads.deletedAt);

	const rows = await db
		.select()
		.from(uploads)
		.where(whereClause)
		.limit(limit)
		.offset(offset)
		.orderBy(uploads.createdAt);

	return rows.map((row) => ({
		uploadId: row.id,
		fingerprint: row.fingerprint,
		filename: row.filename,
		relativePath: row.relativePath,
		size: Number(row.size ?? 0),
		uploadedBytes: Number(row.uploadedBytes ?? 0),
		status: row.status,
		highSensitivity: row.highSensitivity,
		uploadedBy: row.uploadedBy,
		createdAt: row.createdAt
	}));
}

export async function migrateUploadsNow(uploadId?: string | null) {
	if (uploadId) {
		const [updated] = await db
			.update(uploads)
			.set({ status: 'processing' })
			.where(eq(uploads.id, uploadId))
			.returning({ id: uploads.id, status: uploads.status });

		if (!updated) throw new Error('Upload not found');
		return { queued: 1, uploads: [{ uploadId: updated.id, status: updated.status }] };
	}

	const updated = await db
		.update(uploads)
		.set({ status: 'processing' })
		.where(and(eq(uploads.status, 'ready'), isNull(uploads.deletedAt)))
		.returning({ id: uploads.id, status: uploads.status });

	return {
		queued: updated.length,
		uploads: updated.map((row) => ({ uploadId: row.id, status: row.status }))
	};
}
