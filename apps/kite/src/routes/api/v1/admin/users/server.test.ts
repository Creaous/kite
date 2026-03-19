import { describe, expect, it } from 'vitest';

import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { createRequestEvent } from '$lib/server/test/request-event';

import { GET } from './+server';

describe('GET /api/v1/admin/users', () => {
	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/users',
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
			path: '/api/v1/admin/users',
			authenticated: true
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await GET(event);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns users with filters and pagination', async () => {
		await db.insert(user).values([
			{
				id: 'admin-user-1',
				email: 'admin-1@example.com',
				name: 'Admin One',
				emailVerified: true,
				role: 'admin',
				banned: false
			},
			{
				id: 'trusted-user-1',
				email: 'trusted-1@example.com',
				name: 'Trusted One',
				emailVerified: true,
				role: 'trusted',
				banned: true
			},
			{
				id: 'basic-user-1',
				email: 'basic-1@example.com',
				name: 'Basic One',
				emailVerified: true,
				role: 'user',
				banned: false
			}
		]);

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/users?search=trusted&role=trusted&status=banned&limit=1&offset=0',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.users).toHaveLength(1);
		expect(body.data.users[0].id).toBe('trusted-user-1');
		expect(body.data.total).toBe(1);
		expect(body.data.limit).toBe(1);
		expect(body.data.offset).toBe(0);
	});

	it('normalizes limit and offset values', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/users?limit=999&offset=-10',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.limit).toBe(100);
		expect(body.data.offset).toBe(0);
	});
});
