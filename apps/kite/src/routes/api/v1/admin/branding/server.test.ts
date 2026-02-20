import { describe, expect, it } from 'vitest';
import { GET, PUT } from './+server';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('GET/PUT /api/v1/admin/branding', () => {
	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/branding',
				authenticated: false
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 403 for non-admin users', async () => {
		const event = createRequestEvent({
			method: 'GET',
			path: '/api/v1/admin/branding',
			authenticated: true
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await GET(event);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns default branding settings', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/branding',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.appName).toBe('Kite');
		expect(body.data.tagline).toBe('');
		expect(body.data.logoUrl).toBe('');
		expect(body.data.faviconUrl).toBe('');
		expect(body.data.disableIndexing).toBe(false);
	});

	it('returns 400 when appName is missing', async () => {
		const res = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/branding',
				authenticated: true,
				body: { tagline: 'No app name' }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('saves branding settings', async () => {
		const putRes = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/branding',
				authenticated: true,
				body: {
					appName: 'Kite Enterprise',
					tagline: 'Secure transfers',
					logoUrl: '/logo.svg',
					faviconUrl: '/favicon-enterprise.svg',
					disableIndexing: true
				}
			}) as never
		);

		expect(putRes.status).toBe(200);
		const putBody = await putRes.json();
		expect(putBody.data.appName).toBe('Kite Enterprise');

		const getRes = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/branding',
				authenticated: true
			}) as never
		);

		expect(getRes.status).toBe(200);
		const getBody = await getRes.json();
		expect(getBody.data.appName).toBe('Kite Enterprise');
		expect(getBody.data.tagline).toBe('Secure transfers');
		expect(getBody.data.logoUrl).toBe('/logo.svg');
		expect(getBody.data.faviconUrl).toBe('/favicon-enterprise.svg');
		expect(getBody.data.disableIndexing).toBe(true);
	});
});
