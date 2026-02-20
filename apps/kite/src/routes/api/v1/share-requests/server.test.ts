import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './+server';
import { createShareRequest } from '$lib/server/services/shareRequest';
import { createRequestEvent } from '$lib/server/test/request-event';

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			userHasPermission: vi.fn()
		}
	}
}));

import { auth } from '$lib/server/auth';

describe('GET/POST /api/v1/share-requests', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('lists share requests for authenticated users', async () => {
		await createShareRequest({ title: 'Listable request' });

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/share-requests',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
	});

	it('returns 401 for unauthenticated users on list', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/share-requests',
				authenticated: false
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('creates a share request', async () => {
		const userHasPermissionMock = vi.mocked(auth.api.userHasPermission);
		userHasPermissionMock.mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests',
				authenticated: true,
				body: {
					title: 'Need files',
					message: 'Please send by EOD',
					requester: { name: 'Alex', email: 'alex@example.com' }
				}
			}) as never
		);

		expect(res.status).toBe(201);
		expect(userHasPermissionMock).toHaveBeenCalledWith({
			body: {
				userId: 'test-user-id',
				permissions: {
					shareRequest: ['create']
				}
			}
		});
		const body = await res.json();
		expect(body.data.id).toBeDefined();
		expect(body.data.code).toBeDefined();
	});

	it('returns 400 when title is missing', async () => {
		const userHasPermissionMock = vi.mocked(auth.api.userHasPermission);
		userHasPermissionMock.mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests',
				authenticated: true,
				body: { message: 'No title provided' }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests',
				authenticated: false,
				body: {
					title: 'Anonymous request',
					message: 'Upload documents'
				}
			}) as never
		);

		expect(res.status).toBe(401);
		expect(auth.api.userHasPermission).not.toHaveBeenCalled();
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 403 when user lacks shareRequests.create permission', async () => {
		const userHasPermissionMock = vi.mocked(auth.api.userHasPermission);
		userHasPermissionMock.mockResolvedValueOnce({
			error: null,
			success: false
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);

		const event = createRequestEvent({
			method: 'POST',
			path: '/api/v1/share-requests',
			authenticated: true,
			body: {
				title: 'Forbidden create',
				message: 'Should fail'
			}
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'guest';

		const res = await POST(event);
		expect(res.status).toBe(403);
		expect(userHasPermissionMock).toHaveBeenCalledWith({
			body: {
				userId: 'test-user-id',
				permissions: {
					shareRequest: ['create']
				}
			}
		});
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});
});
