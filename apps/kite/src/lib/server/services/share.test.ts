import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../db';
import { uploads, user, shares } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
	createShare,
	createShareDownloadGrant,
	getPublicShareByCode,
	getShare,
	softDeleteShare
} from './share';

describe('share service (db)', () => {
	const createdUploads: string[] = [];
	const createdUsers: string[] = [];
	const createdShares: string[] = [];

	afterEach(async () => {
		for (const id of createdShares.splice(0)) {
			await db.delete(shares).where(eq(shares.id, id)).returning();
		}
		for (const id of createdUploads.splice(0)) {
			await db.delete(uploads).where(eq(uploads.id, id)).returning();
		}
		for (const id of createdUsers.splice(0)) {
			await db.delete(user).where(eq(user.id, id)).returning();
		}
	});

	it('creates a share and attaches uploads', async () => {
		const [u] = await db
			.insert(user)
			.values({
				id: 'share-user-1',
				name: 'share user',
				email: 's@example.com',
				emailVerified: false
			})
			.returning();
		createdUsers.push(u.id);

		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's-fp-1',
				filename: 'a.jpg',
				size: 100,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		const [b] = await db
			.insert(uploads)
			.values({
				fingerprint: 's-fp-2',
				filename: 'b.jpg',
				size: 200,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id, b.id);

		const share = await createShare({
			title: 'My share',
			uploads: [{ uploadId: a.id }, { uploadId: b.id }],
			createdBy: u.id,
			password: 'secret'
		});
		expect(share).toBeTruthy();
		expect(share.passwordProtected).toBe(true);
		expect(share.files).toHaveLength(2);
		createdShares.push(share.id);
	});

	it('getShare returns share with files', async () => {
		const [u] = await db
			.insert(user)
			.values({
				id: 'share-user-2',
				name: 'share user2',
				email: 's2@example.com',
				emailVerified: false
			})
			.returning();
		createdUsers.push(u.id);

		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's2-fp-1',
				filename: 'c.jpg',
				size: 100,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		const share = await createShare({
			title: 'Fetch share',
			uploads: [{ uploadId: a.id }],
			createdBy: u.id
		});
		createdShares.push(share.id);

		const fetched = await getShare(share.id);
		expect(fetched).toBeTruthy();
		expect(fetched?.files).toHaveLength(1);
	});

	it('softDeleteShare marks share deleted', async () => {
		const [u] = await db
			.insert(user)
			.values({
				id: 'share-user-3',
				name: 'share user3',
				email: 's3@example.com',
				emailVerified: false
			})
			.returning();
		createdUsers.push(u.id);

		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's3-fp-1',
				filename: 'd.jpg',
				size: 50,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		const share = await createShare({
			title: 'Delete share',
			uploads: [{ uploadId: a.id }],
			createdBy: u.id
		});
		createdShares.push(share.id);

		const res = await softDeleteShare(share.id);
		expect(res.status).toBe('deleted');
	});

	it('stores highSensitivity on share when enabled', async () => {
		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's-hs-share-fp',
				filename: 'high-sensitive.txt',
				size: 12,
				uploadedBytes: 12,
				status: 'ready',
				highSensitivity: true
			})
			.returning();
		createdUploads.push(a.id);

		const share = await createShare({
			title: 'High sensitivity share',
			uploads: [{ uploadId: a.id }],
			highSensitivity: true
		});
		createdShares.push(share.id);

		const [shareRow] = await db
			.select({ highSensitivity: shares.highSensitivity })
			.from(shares)
			.where(eq(shares.id, share.id));

		expect(shareRow.highSensitivity).toBe(true);
	});

	it('softDeleteShare immediately deletes highSensitivity files linked to the share', async () => {
		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's-hs-delete-fp',
				filename: 'delete-now.txt',
				size: 20,
				uploadedBytes: 20,
				status: 'ready',
				highSensitivity: true
			})
			.returning();
		createdUploads.push(a.id);

		const share = await createShare({
			title: 'Delete high sensitivity',
			uploads: [{ uploadId: a.id }],
			highSensitivity: true
		});
		createdShares.push(share.id);

		await softDeleteShare(share.id);

		const [uploadRow] = await db
			.select({ deletedAt: uploads.deletedAt })
			.from(uploads)
			.where(eq(uploads.id, a.id));

		expect(uploadRow.deletedAt).toBeTruthy();
	});

	it('applies secure defaults for expiry and download limits', async () => {
		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's4-fp-1',
				filename: 'defaults.txt',
				size: 20,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		const before = Date.now();
		const share = await createShare({
			title: 'Defaults share',
			uploads: [{ uploadId: a.id }]
		});
		createdShares.push(share.id);

		expect(share.expiresAt).toBeTruthy();
		const expiresInMs = new Date(share.expiresAt as Date).getTime() - before;
		expect(expiresInMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
		expect(expiresInMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
		expect(share.maxDownloads).toBe(0);
		expect(share.viewCount).toBe(0);
	});

	it('respects message visibility and increments view count', async () => {
		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's5-fp-1',
				filename: 'msg.txt',
				size: 20,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		const visibleShare = await createShare({
			title: 'Visible message',
			password: 'message-secret-1',
			message: 'Public hint',
			hideMessageBehindPassword: false,
			uploads: [{ uploadId: a.id }]
		});
		createdShares.push(visibleShare.id);

		const hiddenShare = await createShare({
			title: 'Hidden message',
			password: 'message-secret-2',
			message: 'Hidden hint',
			hideMessageBehindPassword: true,
			uploads: [{ uploadId: a.id }]
		});
		createdShares.push(hiddenShare.id);

		const visibleResult = await getPublicShareByCode(visibleShare.code);
		expect(visibleResult.requiresPassword).toBe(true);
		expect(visibleResult.message).toBe('Public hint');

		const hiddenResult = await getPublicShareByCode(hiddenShare.code);
		expect(hiddenResult.requiresPassword).toBe(true);
		expect(hiddenResult.message).toBeNull();

		const [visibleFromDb] = await db
			.select({ viewCount: shares.viewCount })
			.from(shares)
			.where(eq(shares.id, visibleShare.id));
		expect(visibleFromDb.viewCount).toBe(1);
	});

	it('enforces max download limits', async () => {
		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 's6-fp-1',
				filename: 'limit.txt',
				size: 20,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		const share = await createShare({
			title: 'Limited download',
			maxDownloads: 1,
			uploads: [{ uploadId: a.id }]
		});
		createdShares.push(share.id);

		const first = await createShareDownloadGrant(share.code);
		expect(first.token).toBeTruthy();

		await expect(createShareDownloadGrant(share.code)).rejects.toThrow('Download limit reached');
	});
});
