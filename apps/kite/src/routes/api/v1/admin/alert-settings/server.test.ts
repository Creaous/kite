import { createRequestEvent } from '$lib/server/test/request-event';
import { describe, expect, it } from 'vitest';

import { GET, PUT } from './+server';

describe('GET/PUT /api/v1/admin/alert-settings', () => {
	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/alert-settings',
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
			path: '/api/v1/admin/alert-settings',
			authenticated: true
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await GET(event);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns default alert settings', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/alert-settings',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.globalAnnouncement.enabled).toBe(false);
		expect(body.data.globalAnnouncement.message).toBe('');
		expect(body.data.globalAnnouncement.type).toBe('info');
		expect(body.data.shareFlowAlert.enabled).toBe(false);
		expect(body.data.shareFlowAlert.message).toBe('');
		expect(body.data.shareFlowAlert.type).toBe('info');
	});

	it('returns 400 for invalid input', async () => {
		const res = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/alert-settings',
				authenticated: true,
				body: {
					globalAnnouncement: {
						enabled: true,
						message: 'Planned maintenance'
					}
				}
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('saves alert settings', async () => {
		const putRes = await PUT(
			createRequestEvent({
				method: 'PUT',
				path: '/api/v1/admin/alert-settings',
				authenticated: true,
				body: {
					globalAnnouncement: {
						enabled: true,
						message: 'Scheduled maintenance tonight',
						type: 'warning'
					},
					shareFlowAlert: {
						enabled: true,
						message: 'Do not upload sensitive documents this week',
						type: 'error'
					}
				}
			}) as never
		);

		expect(putRes.status).toBe(200);
		const putBody = await putRes.json();
		expect(putBody.data.globalAnnouncement.type).toBe('warning');
		expect(putBody.data.shareFlowAlert.type).toBe('error');

		const getRes = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/alert-settings',
				authenticated: true
			}) as never
		);

		expect(getRes.status).toBe(200);
		const getBody = await getRes.json();
		expect(getBody.data.globalAnnouncement.enabled).toBe(true);
		expect(getBody.data.globalAnnouncement.message).toBe('Scheduled maintenance tonight');
		expect(getBody.data.globalAnnouncement.type).toBe('warning');
		expect(getBody.data.shareFlowAlert.enabled).toBe(true);
		expect(getBody.data.shareFlowAlert.message).toBe('Do not upload sensitive documents this week');
		expect(getBody.data.shareFlowAlert.type).toBe('error');
	});
});
