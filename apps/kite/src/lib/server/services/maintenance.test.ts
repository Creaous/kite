import { describe, expect, it } from 'vitest';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '../db';
import { shareUpload, shares, uploads } from '../db/schema';

import { expireSharesWithExpiryDate, expireUnusedUploads } from './maintenance';

describe('maintenance service (db)', () => {
	it('expires old uploads that are not linked to shares', async () => {
		const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000);

		const [unusedUpload] = await db
			.insert(uploads)
			.values({
				fingerprint: 'maintenance-unused-upload',
				filename: 'unused.bin',
				size: 12,
				uploadedBytes: 12,
				status: 'ready',
				createdAt: oldTimestamp
			})
			.returning({ id: uploads.id });

		const [linkedUpload] = await db
			.insert(uploads)
			.values({
				fingerprint: 'maintenance-linked-upload',
				filename: 'linked.bin',
				size: 12,
				uploadedBytes: 12,
				status: 'ready',
				createdAt: oldTimestamp
			})
			.returning({ id: uploads.id });

		const [linkedShare] = await db
			.insert(shares)
			.values({
				code: 'MAINT1',
				title: 'Linked share',
				status: 'active'
			})
			.returning({ id: shares.id });

		await db.insert(shareUpload).values({ shareId: linkedShare.id, uploadId: linkedUpload.id });

		const result = await expireUnusedUploads({ olderThanMinutes: 60, now: new Date() });
		expect(result.expiredUploads).toBe(1);

		const [unusedUploadRow] = await db
			.select({ deletedAt: uploads.deletedAt })
			.from(uploads)
			.where(eq(uploads.id, unusedUpload.id));
		expect(unusedUploadRow.deletedAt).toBeTruthy();

		const [linkedUploadRow] = await db
			.select({ deletedAt: uploads.deletedAt })
			.from(uploads)
			.where(eq(uploads.id, linkedUpload.id));
		expect(linkedUploadRow.deletedAt).toBeNull();
	});

	it('expires only shares with explicit past expiry dates', async () => {
		const now = new Date();
		const past = new Date(now.getTime() - 60_000);
		const future = new Date(now.getTime() + 60_000);

		const [pastShare] = await db
			.insert(shares)
			.values({ code: 'MAINT2', title: 'Past', status: 'active', expiresAt: past })
			.returning({ id: shares.id });

		const [futureShare] = await db
			.insert(shares)
			.values({ code: 'MAINT3', title: 'Future', status: 'active', expiresAt: future })
			.returning({ id: shares.id });

		const [noExpiryShare] = await db
			.insert(shares)
			.values({ code: 'MAINT4', title: 'No expiry', status: 'active', expiresAt: null })
			.returning({ id: shares.id });

		const result = await expireSharesWithExpiryDate({ now });
		expect(result.expiredShares).toBe(1);

		const [expiredShareRow] = await db
			.select({ status: shares.status })
			.from(shares)
			.where(eq(shares.id, pastShare.id));
		expect(expiredShareRow.status).toBe('expired');

		const activeShareRows = await db
			.select({ id: shares.id, status: shares.status })
			.from(shares)
			.where(
				and(
					isNull(shares.deletedAt),
					eq(shares.status, 'active'),
					inArray(shares.id, [futureShare.id, noExpiryShare.id])
				)
			);

		expect(activeShareRows).toHaveLength(2);
	});
});
