import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { createShareRequest } from '$lib/server/services/shareRequest';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('GET /api/v1/public/share-requests/:code', () => {
	it('returns public share-request details', async () => {
		const req = await createShareRequest({ title: 'Need docs' });

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/share-requests/${req.code}`,
				params: { code: req.code ?? '' }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.code).toBe(req.code);
	});

	it('returns 404 when share request code is unknown', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/public/share-requests/UNKNOWN1',
				params: { code: 'UNKNOWN1' }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('NOT_FOUND');
	});
});
