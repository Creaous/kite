import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { createShareRequest, updateShareRequest } from '$lib/server/services/shareRequest';
import { initiateUpload } from '$lib/server/services/upload';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('POST /api/v1/public/share-requests/:code/respond', () => {
	const originalAllowAnonymousUsers = process.env.ALLOW_ANONYMOUS_USERS;

	afterEach(() => {
		process.env.ALLOW_ANONYMOUS_USERS = originalAllowAnonymousUsers;
	});

	it('responds to a share request with uploads', async () => {
		const req = await createShareRequest({ title: 'Upload documents' });
		const up = await initiateUpload({
			filename: 'response-file.txt',
			size: 42,
			fingerprint: 'fp-request-respond-1'
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/respond`,
				params: { code: req.code ?? '' },
				authenticated: true,
				body: { uploads: [{ uploadId: up.uploadId }] }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.shareId).toBeDefined();
	});

	it('returns 400 when uploads are missing', async () => {
		const req = await createShareRequest({ title: 'Upload missing case' });

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/respond`,
				params: { code: req.code ?? '' },
				authenticated: true,
				body: { uploads: [] }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('returns 404 when request code does not exist', async () => {
		const up = await initiateUpload({
			filename: 'response-file-unknown-request.txt',
			size: 42,
			fingerprint: 'fp-request-respond-unknown'
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/public/share-requests/UNKNOWN1/respond',
				params: { code: 'UNKNOWN1' },
				authenticated: true,
				body: { uploads: [{ uploadId: up.uploadId }] }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('SHARE_REQUEST_RESPOND_FAILED');
	});

	it('returns 401 for unauthenticated users', async () => {
		const req = await createShareRequest({ title: 'Auth required' });
		const up = await initiateUpload({
			filename: 'response-auth-required.txt',
			size: 42,
			fingerprint: 'fp-request-respond-auth-required'
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/respond`,
				params: { code: req.code ?? '' },
				authenticated: false,
				body: { uploads: [{ uploadId: up.uploadId }] }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('allows anonymous authenticated user when ALLOW_ANONYMOUS_USERS is true', async () => {
		process.env.ALLOW_ANONYMOUS_USERS = 'true';

		const req = await createShareRequest({ title: 'Anonymous allowed' });
		const up = await initiateUpload({
			filename: 'response-anonymous-allowed.txt',
			size: 42,
			fingerprint: 'fp-request-respond-anon-allowed'
		});

		const event = createRequestEvent({
			method: 'POST',
			path: `/api/v1/public/share-requests/${req.code}/respond`,
			params: { code: req.code ?? '' },
			authenticated: true,
			body: { uploads: [{ uploadId: up.uploadId }] }
		}) as never;
		(event as { locals: { user: { isAnonymous: boolean } } }).locals.user.isAnonymous = true;

		const res = await POST(event);

		expect(res.status).toBe(200);
	});

	it('blocks anonymous authenticated user when ALLOW_ANONYMOUS_USERS is false', async () => {
		process.env.ALLOW_ANONYMOUS_USERS = 'false';

		const req = await createShareRequest({ title: 'Anonymous blocked' });
		const up = await initiateUpload({
			filename: 'response-anonymous-blocked.txt',
			size: 42,
			fingerprint: 'fp-request-respond-anon-blocked'
		});

		const event = createRequestEvent({
			method: 'POST',
			path: `/api/v1/public/share-requests/${req.code}/respond`,
			params: { code: req.code ?? '' },
			authenticated: true,
			body: { uploads: [{ uploadId: up.uploadId }] }
		}) as never;
		(event as { locals: { user: { isAnonymous: boolean } } }).locals.user.isAnonymous = true;

		const res = await POST(event);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 409 when submission limit is reached', async () => {
		const req = await createShareRequest({ title: 'Limited request', maxSubmissions: 1 });
		const firstUpload = await initiateUpload({
			filename: 'response-limit-1.txt',
			size: 42,
			fingerprint: 'fp-request-respond-limit-1'
		});

		const firstRes = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/respond`,
				params: { code: req.code ?? '' },
				authenticated: true,
				body: { uploads: [{ uploadId: firstUpload.uploadId }] }
			}) as never
		);
		expect(firstRes.status).toBe(200);

		await updateShareRequest(req.id, { status: 'open' });

		const secondUpload = await initiateUpload({
			filename: 'response-limit-2.txt',
			size: 42,
			fingerprint: 'fp-request-respond-limit-2'
		});

		const secondRes = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/respond`,
				params: { code: req.code ?? '' },
				authenticated: true,
				body: { uploads: [{ uploadId: secondUpload.uploadId }] }
			}) as never
		);

		expect(secondRes.status).toBe(409);
		const body = await secondRes.json();
		expect(body.error.code).toBe('SHARE_REQUEST_RESPOND_FAILED');
	});
});
