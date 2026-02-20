import { rm } from 'node:fs/promises';

import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { db } from '../db';
import { shareUpload, shares, uploads } from '../db/schema';

export async function expireUnusedUploads(options?: { olderThanMinutes?: number; now?: Date }) {
	const now = options?.now ?? new Date();
	const olderThanMinutes = Math.max(1, options?.olderThanMinutes ?? 60);
	const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000);

	const candidates = await db
		.select({ id: uploads.id, storagePath: uploads.storagePath })
		.from(uploads)
		.where(
			and(
				isNull(uploads.deletedAt),
				lt(uploads.createdAt, cutoff),
				sql`not exists (select 1 from ${shareUpload} su where su.upload_id = ${uploads.id})`
			)
		);

	if (candidates.length === 0) {
		return { expiredUploads: 0, removedFromDisk: 0 };
	}

	const candidateIds = candidates.map((candidate) => candidate.id);

	await db
		.update(uploads)
		.set({ deletedAt: now })
		.where(and(isNull(uploads.deletedAt), inArray(uploads.id, candidateIds)));

	let removedFromDisk = 0;
	for (const candidate of candidates) {
		if (!candidate.storagePath) continue;

		const [stillReferenced] = await db
			.select({ id: uploads.id })
			.from(uploads)
			.where(and(isNull(uploads.deletedAt), eq(uploads.storagePath, candidate.storagePath)))
			.limit(1);

		if (stillReferenced) continue;

		await rm(candidate.storagePath, { force: true }).catch(() => undefined);
		removedFromDisk += 1;
	}

	return {
		expiredUploads: candidateIds.length,
		removedFromDisk
	};
}

export async function expireSharesWithExpiryDate(options?: { now?: Date }) {
	const now = options?.now ?? new Date();

	const expired = await db
		.update(shares)
		.set({ status: 'expired' })
		.where(
			and(
				eq(shares.status, 'active'),
				isNull(shares.deletedAt),
				isNotNull(shares.expiresAt),
				lt(shares.expiresAt, now)
			)
		)
		.returning({ id: shares.id });

	return {
		expiredShares: expired.length
	};
}
