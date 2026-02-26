import { describe, expect, it } from 'vitest';
import { DELETE, GET, PATCH } from './+server';
import { initiateUpload } from '$lib/server/services/upload';
import { createShare } from '$lib/server/services/share';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('GET/DELETE /api/v1/shares/:shareId', () => {
	const missingShareId = '00000000-0000-0000-0000-000000000000';

	it('returns then soft-deletes a share', async () => {
		const uploaded = await initiateUpload({
			filename: 'share-fetch.txt',
			size: 12,
			fingerprint: 'fp-share-fetch-1'
		});
		const share = await createShare({
			title: 'To Fetch',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const getRes = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/shares/${share.id}`,
				authenticated: true,
				params: { shareId: share.id }
			}) as never
		);
		expect(getRes.status).toBe(200);

		const delRes = await DELETE(
			createRequestEvent({
				method: 'DELETE',
				path: `/api/v1/shares/${share.id}`,
				authenticated: true,
				params: { shareId: share.id }
			}) as never
		);
		expect(delRes.status).toBe(204);
	});

	it('returns 404 when share does not exist', async () => {
		const getRes = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/shares/${missingShareId}`,
				authenticated: true,
				params: { shareId: missingShareId }
			}) as never
		);

		expect(getRes.status).toBe(404);
		const body = await getRes.json();
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 404 when deleting a non-existent share', async () => {
		const delRes = await DELETE(
			createRequestEvent({
				method: 'DELETE',
				path: `/api/v1/shares/${missingShareId}`,
				authenticated: true,
				params: { shareId: missingShareId }
			}) as never
		);

		expect(delRes.status).toBe(404);
		const body = await delRes.json();
		expect(body.error.code).toBe('SHARE_DELETE_FAILED');
	});

	it('updates a share with PATCH', async () => {
		const uploaded = await initiateUpload({
			filename: 'share-update.txt',
			size: 12,
			fingerprint: 'fp-share-update-1'
		});
		const share = await createShare({
			title: 'Before Update',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const patchRes = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: `/api/v1/shares/${share.id}`,
				authenticated: true,
				params: { shareId: share.id },
				body: {
					title: 'After Update',
					message: 'Updated message',
					maxDownloads: 10
				}
			}) as never
		);

		expect(patchRes.status).toBe(200);
		const body = await patchRes.json();
		expect(body.data.title).toBe('After Update');
		expect(body.data.message).toBe('Updated message');
		expect(body.data.maxDownloads).toBe(10);
	});
});
