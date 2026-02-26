import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { createShareRequest } from '$lib/server/services/shareRequest';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('POST /api/v1/public/share-requests/:code/anonymous-token', () => {
	const originalAllowAnonymousUsers = process.env.ALLOW_ANONYMOUS_USERS;

	afterEach(() => {
		process.env.ALLOW_ANONYMOUS_USERS = originalAllowAnonymousUsers;
	});

	it('creates an anonymous token for an open share request', async () => {
		process.env.ALLOW_ANONYMOUS_USERS = 'true';
		const req = await createShareRequest({ title: 'Allow anonymous token' });

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/anonymous-token`,
				params: { code: req.code ?? '' }
			}) as never
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.data.token).toBeDefined();
		expect(body.data.expiresAt).toBeDefined();
	});

	it('returns 403 when anonymous users are disabled', async () => {
		process.env.ALLOW_ANONYMOUS_USERS = 'false';
		const req = await createShareRequest({ title: 'Anonymous disabled' });

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/share-requests/${req.code}/anonymous-token`,
				params: { code: req.code ?? '' }
			}) as never
		);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('ANONYMOUS_DISABLED');
	});

	it('returns 404 for unknown request code', async () => {
		process.env.ALLOW_ANONYMOUS_USERS = 'true';

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/public/share-requests/UNKNOWN1/anonymous-token',
				params: { code: 'UNKNOWN1' }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('NOT_FOUND');
	});
});
