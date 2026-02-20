import { describe, expect, it } from 'vitest';
import { POST } from './+server';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('POST /api/v1/tokens', () => {
	it('creates a short-lived token', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/tokens',
				authenticated: true,
				body: { subject: 'share-123', purpose: 'download', expiresInSec: 120 }
			}) as never
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.data.token).toBeDefined();
		expect(body.data.expiresAt).toBeDefined();
	});

	it('returns 400 when subject is missing', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/tokens',
				authenticated: true,
				body: { purpose: 'download', expiresInSec: 120 }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});
});
