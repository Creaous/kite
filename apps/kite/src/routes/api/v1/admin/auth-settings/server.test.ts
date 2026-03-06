import { createRequestEvent } from '$lib/server/test/request-event';
import { describe, expect, it } from 'vitest';

import { GET, PUT } from './+server';

describe('GET/PUT /api/v1/admin/auth-settings', () => {
	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/auth-settings',
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
			path: '/api/v1/admin/auth-settings',
			authenticated: true
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await GET(event);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns defaults for admin users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/auth-settings',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(typeof body.data.registrationEnabled).toBe('boolean');
		expect(typeof body.data.anonymousTokensEnabled).toBe('boolean');
		expect(typeof body.data.publicApiEnabled).toBe('boolean');
		expect(Array.isArray(body.data.enabledSocialProviders)).toBe(true);
		expect(Array.isArray(body.data.availableSocialProviders)).toBe(true);
	});

	it('returns 400 for invalid input', async () => {
		const res = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/auth-settings',
				authenticated: true,
				body: {
					registrationEnabled: true,
					anonymousTokensEnabled: true,
					publicApiEnabled: true
				}
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('saves auth settings', async () => {
		const putRes = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/auth-settings',
				authenticated: true,
				body: {
					registrationEnabled: false,
					anonymousTokensEnabled: false,
					publicApiEnabled: false,
					enabledSocialProviders: []
				}
			}) as never
		);

		expect(putRes.status).toBe(200);
		const putBody = await putRes.json();
		expect(putBody.data.registrationEnabled).toBe(false);
		expect(putBody.data.anonymousTokensEnabled).toBe(false);
		expect(putBody.data.publicApiEnabled).toBe(false);

		const getRes = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/auth-settings',
				authenticated: true
			}) as never
		);

		expect(getRes.status).toBe(200);
		const getBody = await getRes.json();
		expect(getBody.data.registrationEnabled).toBe(false);
		expect(getBody.data.anonymousTokensEnabled).toBe(false);
		expect(getBody.data.publicApiEnabled).toBe(false);
		expect(Array.isArray(getBody.data.enabledSocialProviders)).toBe(true);
	});
});
