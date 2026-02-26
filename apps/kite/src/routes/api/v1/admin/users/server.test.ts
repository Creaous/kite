import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestEvent } from '$lib/server/test/request-event';

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			listUsers: vi.fn()
		}
	}
}));

import { GET } from './+server';
import { auth } from '$lib/server/auth';

describe('GET /api/v1/admin/users', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

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

	it('returns users and normalizes query params', async () => {
		const listUsersMock = vi.mocked(auth.api.listUsers);
		listUsersMock.mockResolvedValueOnce({ users: [], total: 0 });

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/users?search=test%40example.com&limit=999&offset=-10',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		expect(listUsersMock).toHaveBeenCalledWith(
			expect.objectContaining({
				query: expect.objectContaining({
					searchValue: 'test@example.com',
					limit: 100,
					offset: 0,
					searchField: 'email',
					sortBy: 'createdAt',
					sortDirection: 'desc'
				})
			})
		);

		const body = await res.json();
		expect(body.data.users).toEqual([]);
		expect(body.data.total).toBe(0);
	});

	it('returns 401 when auth API reports unauthorized', async () => {
		const listUsersMock = vi.mocked(auth.api.listUsers);
		listUsersMock.mockRejectedValueOnce(new Error('UNAUTHORIZED'));

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/users',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('ADMIN_LIST_USERS_FAILED');
	});
});
