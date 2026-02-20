import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestEvent } from '$lib/server/test/request-event';

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			setRole: vi.fn()
		}
	}
}));

import { PATCH } from './+server';
import { auth } from '$lib/server/auth';

describe('PATCH /api/v1/admin/users/:userId/role', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/admin/users/user-1/role',
				authenticated: false,
				params: { userId: 'user-1' },
				body: { role: 'trusted' }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 403 for non-admin users', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			path: '/api/v1/admin/users/user-1/role',
			authenticated: true,
			params: { userId: 'user-1' },
			body: { role: 'trusted' }
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await PATCH(event);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns 400 for missing userId', async () => {
		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/admin/users//role',
				authenticated: true,
				params: {},
				body: { role: 'trusted' }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_USER_ID');
	});

	it('returns 400 for invalid role', async () => {
		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/admin/users/user-1/role',
				authenticated: true,
				params: { userId: 'user-1' },
				body: { role: 'superadmin' }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_ROLE');
	});

	it('updates role successfully', async () => {
		const setRoleMock = vi.mocked(auth.api.setRole);
		setRoleMock.mockResolvedValueOnce({} as never);

		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/admin/users/user-1/role',
				authenticated: true,
				params: { userId: 'user-1' },
				body: { role: 'trusted' }
			}) as never
		);

		expect(res.status).toBe(200);
		expect(setRoleMock).toHaveBeenCalledWith(
			expect.objectContaining({
				body: {
					userId: 'user-1',
					role: 'trusted'
				}
			})
		);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	it('returns 500 when role update fails', async () => {
		const setRoleMock = vi.mocked(auth.api.setRole);
		setRoleMock.mockRejectedValueOnce(new Error('backend error'));

		const res = await PATCH(
			createRequestEvent({
				method: 'PATCH',
				path: '/api/v1/admin/users/user-1/role',
				authenticated: true,
				params: { userId: 'user-1' },
				body: { role: 'trusted' }
			}) as never
		);

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error.code).toBe('ADMIN_SET_ROLE_FAILED');
	});
});
