import { describe, expect, it } from 'vitest';
import { PATCH, DELETE } from './+server';
import { createShareRequest, getShareRequestByCode } from '$lib/server/services/shareRequest';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('PATCH/DELETE /api/v1/share-requests/:requestId', () => {
	it('updates a share request', async () => {
		const created = await createShareRequest({
			title: 'Original title',
			message: 'Original message',
			requester: { name: 'Before', email: 'before@example.com' }
		});

		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: `/api/v1/share-requests/${created.id}`,
				authenticated: true,
				params: { requestId: created.id },
				body: {
					title: 'Updated title',
					status: 'expired',
					requester: { name: 'After', email: 'after@example.com' }
				}
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe(created.id);
		expect(body.data.title).toBe('Updated title');
		expect(body.data.status).toBe('expired');
		expect(body.data.requesterName).toBe('After');
		expect(body.data.requesterEmail).toBe('after@example.com');
	});

	it('updates requester email visibility', async () => {
		const created = await createShareRequest({
			title: 'Request with visible email',
			requester: {
				email: 'visible@example.com'
			}
		});

		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: `/api/v1/share-requests/${created.id}`,
				authenticated: true,
				params: { requestId: created.id },
				body: { hideRequesterEmail: true }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.hideRequesterEmail).toBe(true);
	});

	it('returns 401 for unauthenticated PATCH', async () => {
		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/share-requests/request-id',
				authenticated: false,
				params: { requestId: 'request-id' },
				body: { title: 'Nope' }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for unknown PATCH requestId', async () => {
		const missingRequestId = '00000000-0000-0000-0000-000000000000';
		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: `/api/v1/share-requests/${missingRequestId}`,
				authenticated: true,
				params: { requestId: missingRequestId },
				body: { title: 'Nope' }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('SHARE_REQUEST_UPDATE_FAILED');
	});

	it('soft-deletes a share request', async () => {
		const created = await createShareRequest({ title: 'Delete me' });

		const res = await DELETE(
			createRequestEvent({
				method: 'DELETE',
				path: `/api/v1/share-requests/${created.id}`,
				authenticated: true,
				params: { requestId: created.id }
			}) as never
		);

		expect(res.status).toBe(204);
		expect(created.code).toBeTruthy();
		const deleted = await getShareRequestByCode(created.code as string);
		expect(deleted).toBeNull();
	});

	it('returns 404 for unknown DELETE requestId', async () => {
		const missingRequestId = '00000000-0000-0000-0000-000000000000';
		const res = await DELETE(
			createRequestEvent({
				method: 'DELETE',
				path: `/api/v1/share-requests/${missingRequestId}`,
				authenticated: true,
				params: { requestId: missingRequestId }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('SHARE_REQUEST_DELETE_FAILED');
	});
});
