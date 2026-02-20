import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../db';
import { uploads, user, shareRequests, shares } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createShareRequest, respondToRequest } from './shareRequest';

describe('shareRequest service (db)', () => {
	const createdUploads: string[] = [];
	const createdUsers: string[] = [];
	const createdRequests: string[] = [];
	const createdShares: string[] = [];

	afterEach(async () => {
		for (const id of createdShares.splice(0)) {
			await db.delete(shares).where(eq(shares.id, id)).returning();
		}
		for (const id of createdRequests.splice(0)) {
			await db.delete(shareRequests).where(eq(shareRequests.id, id)).returning();
		}
		for (const id of createdUploads.splice(0)) {
			await db.delete(uploads).where(eq(uploads.id, id)).returning();
		}
		for (const id of createdUsers.splice(0)) {
			await db.delete(user).where(eq(user.id, id)).returning();
		}
	});

	it('creates a request and responds with a share', async () => {
		const [u] = await db
			.insert(user)
			.values({ id: 'rq-user-1', name: 'rq user', email: 'rq@example.com', emailVerified: false })
			.returning();
		createdUsers.push(u.id);

		const req = await createShareRequest({
			title: 'Please send files',
			requester: { name: 'Req' },
			createdBy: u.id
		});
		expect(req).toBeTruthy();
		createdRequests.push(req.id);

		const [a] = await db
			.insert(uploads)
			.values({
				fingerprint: 'rq-fp-1',
				filename: 'x.jpg',
				size: 10,
				uploadedBytes: 0,
				status: 'ready'
			})
			.returning();
		createdUploads.push(a.id);

		if (!req.code) throw new Error('created request has no code');
		const res = await respondToRequest(req.code, [{ uploadId: a.id }]);
		expect(res).toBeTruthy();
		expect(res.shareId).toBeDefined();
		createdShares.push(res.shareId);

		// verify request status updated
		const updated = await db.query.shareRequests.findFirst({ where: { id: req.id } });
		expect(updated?.status).toBe('fulfilled');
	});
});
