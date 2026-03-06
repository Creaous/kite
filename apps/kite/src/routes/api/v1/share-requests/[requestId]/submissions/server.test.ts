import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { createRequestEvent } from '$lib/server/test/request-event';
import { createShareRequest, respondToRequest } from '$lib/server/services/shareRequest';
import { initiateUpload } from '$lib/server/services/upload';

describe('GET /api/v1/share-requests/:requestId/submissions', () => {
	it('lists submissions for a request', async () => {
		const request = await createShareRequest({
			title: 'Submission list request',
			maxSubmissions: 3
		});
		const upload = await initiateUpload({
			filename: 'submission-list.txt',
			size: 42,
			fingerprint: 'fp-submission-list'
		});

		await respondToRequest(request.code!, [{ uploadId: upload.uploadId }]);

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/share-requests/${request.id}/submissions`,
				authenticated: true,
				params: { requestId: request.id }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data).toHaveLength(1);
		expect(body.data[0].uploadCount).toBe(1);
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/share-requests/request-id/submissions',
				authenticated: false,
				params: { requestId: 'request-id' }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 when request does not exist', async () => {
		const missingRequestId = '00000000-0000-0000-0000-000000000000';
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/share-requests/${missingRequestId}/submissions`,
				authenticated: true,
				params: { requestId: missingRequestId }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('SHARE_REQUEST_SUBMISSIONS_FETCH_FAILED');
	});
});
