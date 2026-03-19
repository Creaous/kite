import { describe, expect, it } from 'vitest';

import { createRequestEvent } from '$lib/server/test/request-event';
import { createAuditLogEvent } from '$lib/server/services/audit';

import { GET } from './+server';

describe('GET /api/v1/admin/audit-logs', () => {
	it('returns 401 for unauthenticated users', async () => {
		const response = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/audit-logs',
				authenticated: false
			}) as never
		);

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns audit logs for admin users', async () => {
		await createAuditLogEvent({
			action: 'share.created',
			actorId: 'test-user-id',
			resourceType: 'share',
			resourceId: 'share-1',
			payload: { request: { method: 'POST', path: '/api/v1/shares' } }
		});

		await createAuditLogEvent({
			action: 'auth.sign_in.email',
			actorId: 'test-user-id',
			resourceType: 'auth',
			resourceId: '/api/auth/sign-in/email',
			payload: { request: { method: 'POST', path: '/api/auth/sign-in/email' } }
		});

		const response = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/audit-logs?limit=50',
				authenticated: true
			}) as never
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(Array.isArray(body.data.logs)).toBe(true);
		expect(body.data.logs.length).toBeGreaterThanOrEqual(2);
		expect(body.data.total).toBeGreaterThanOrEqual(2);
		expect(body.data.limit).toBe(50);
	});

	it('filters by action substring', async () => {
		await createAuditLogEvent({
			action: 'settings.updated',
			actorId: 'test-user-id',
			resourceType: 'settings',
			resourceId: 'global'
		});

		const response = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/audit-logs?action=settings',
				authenticated: true
			}) as never
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(
			body.data.logs.every((entry: { action: string }) => entry.action.includes('settings'))
		).toBe(true);
	});

	it('applies method, status, and page filters', async () => {
		await createAuditLogEvent({
			action: 'http.request.completed',
			actorId: 'test-user-id',
			resourceType: 'route',
			resourceId: '/api/v1/shares',
			payload: {
				request: {
					method: 'GET',
					path: '/api/v1/shares',
					status: 200
				}
			}
		});

		await createAuditLogEvent({
			action: 'http.request.completed',
			actorId: 'test-user-id',
			resourceType: 'route',
			resourceId: '/api/v1/shares',
			payload: {
				request: {
					method: 'POST',
					path: '/api/v1/shares',
					status: 201
				}
			}
		});

		const filtered = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/audit-logs?method=GET&status=200&path=/api/v1/shares&limit=1&offset=0',
				authenticated: true
			}) as never
		);

		expect(filtered.status).toBe(200);
		const filteredBody = await filtered.json();
		expect(filteredBody.data.logs.length).toBe(1);
		expect(filteredBody.data.logs[0].payload.request.method).toBe('GET');
		expect(filteredBody.data.logs[0].payload.request.status).toBe(200);
		expect(filteredBody.data.total).toBeGreaterThanOrEqual(1);
	});
});
