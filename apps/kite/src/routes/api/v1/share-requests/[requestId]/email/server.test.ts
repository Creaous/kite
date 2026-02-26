import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			userHasPermission: vi.fn()
		}
	}
}));

vi.mock('$lib/server/services/shareRequestEmail', () => ({
	isShareRequestEmailConfigured: vi.fn(),
	sendShareRequestEmail: vi.fn()
}));

import { POST } from './+server';
import { createRequestEvent } from '$lib/server/test/request-event';
import { createShareRequest } from '$lib/server/services/shareRequest';
import { auth } from '$lib/server/auth';
import {
	isShareRequestEmailConfigured,
	sendShareRequestEmail
} from '$lib/server/services/shareRequestEmail';

describe('POST /api/v1/share-requests/:requestId/email', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when user is unauthenticated', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests/abc/email',
				authenticated: false,
				params: { requestId: 'abc' },
				body: { recipients: [{ email: 'to@example.com' }] }
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('returns 403 without permission', async () => {
		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: false
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests/abc/email',
				authenticated: true,
				params: { requestId: 'abc' },
				body: { recipients: [{ email: 'to@example.com' }] }
			}) as never
		);

		expect(res.status).toBe(403);
	});

	it('returns 503 when SMTP is not configured', async () => {
		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);
		vi.mocked(isShareRequestEmailConfigured).mockReturnValueOnce(false);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests/abc/email',
				authenticated: true,
				params: { requestId: 'abc' },
				body: { recipients: [{ email: 'to@example.com' }] }
			}) as never
		);

		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error.code).toBe('SMTP_NOT_CONFIGURED');
	});

	it('returns 400 for invalid recipients', async () => {
		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);
		vi.mocked(isShareRequestEmailConfigured).mockReturnValueOnce(true);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests/abc/email',
				authenticated: true,
				params: { requestId: 'abc' },
				body: { recipients: [{ name: 'Alice' }] }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('returns 404 when share request does not exist', async () => {
		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);
		vi.mocked(isShareRequestEmailConfigured).mockReturnValueOnce(true);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/share-requests/00000000-0000-0000-0000-000000000000/email',
				authenticated: true,
				params: { requestId: '00000000-0000-0000-0000-000000000000' },
				body: { recipients: [{ email: 'to@example.com' }] }
			}) as never
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('SHARE_REQUEST_NOT_FOUND');
	});

	it('queues share request email to recipients', async () => {
		const created = await createShareRequest({
			title: 'Need docs',
			message: 'Please upload by Thursday',
			requester: {
				name: 'Ops',
				email: 'ops@example.com'
			}
		});

		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);
		vi.mocked(isShareRequestEmailConfigured).mockReturnValueOnce(true);
		vi.mocked(sendShareRequestEmail).mockResolvedValueOnce({
			accepted: ['alice@example.com'],
			rejected: []
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/share-requests/${created.id}/email`,
				authenticated: true,
				params: { requestId: created.id },
				body: {
					recipients: [
						{ name: 'Alice', email: 'alice@example.com' },
						{ name: 'Alice Two', email: ' ALICE@example.com ' }
					]
				}
			}) as never
		);

		expect(res.status).toBe(202);
		expect(sendShareRequestEmail).toHaveBeenCalledTimes(1);
		expect(sendShareRequestEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				recipients: [{ name: 'Alice', email: 'alice@example.com' }],
				requestUrl: `http://localhost/r/${created.code}`,
				shareRequest: expect.objectContaining({
					code: created.code
				})
			})
		);
		const body = await res.json();
		expect(body.data.accepted).toEqual(['alice@example.com']);
		expect(body.data.rejected).toEqual([]);
	});

	it('does not include requester email in outbound payload when hidden', async () => {
		const created = await createShareRequest({
			title: 'Hidden requester',
			requester: {
				name: 'Ops',
				email: 'ops@example.com'
			},
			hideRequesterEmail: true
		});

		vi.mocked(auth.api.userHasPermission).mockResolvedValueOnce({
			error: null,
			success: true
		} as Awaited<ReturnType<typeof auth.api.userHasPermission>>);
		vi.mocked(isShareRequestEmailConfigured).mockReturnValueOnce(true);
		vi.mocked(sendShareRequestEmail).mockResolvedValueOnce({
			accepted: ['alice@example.com'],
			rejected: []
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/share-requests/${created.id}/email`,
				authenticated: true,
				params: { requestId: created.id },
				body: {
					recipients: [{ email: 'alice@example.com' }]
				}
			}) as never
		);

		expect(res.status).toBe(202);
		expect(sendShareRequestEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				shareRequest: expect.objectContaining({
					requesterEmail: null
				})
			})
		);
	});
});
