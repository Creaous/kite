import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '$lib/server/test/request-event';

vi.mock('$lib/server/queues/maintenance', () => ({
	enqueueMaintenanceJobs: vi.fn(),
	getMaintenanceQueueStatus: vi.fn()
}));

import { GET, POST } from './+server';
import { enqueueMaintenanceJobs, getMaintenanceQueueStatus } from '$lib/server/queues/maintenance';

describe('GET /api/v1/admin/maintenance', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/maintenance',
				authenticated: false
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('returns 403 for non-admin users', async () => {
		const event = createRequestEvent({
			method: 'GET',
			path: '/api/v1/admin/maintenance',
			authenticated: true
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await GET(event);
		expect(res.status).toBe(403);
	});

	it('returns queue status for admins', async () => {
		const statusMock = vi.mocked(getMaintenanceQueueStatus);
		statusMock.mockResolvedValueOnce([
			{
				job: 'expire-unused-uploads',
				counts: { waiting: 1, active: 0, delayed: 0, completed: 3, failed: 0, paused: 0 },
				isPaused: false
			},
			{
				job: 'expire-expired-shares',
				counts: { waiting: 0, active: 1, delayed: 0, completed: 2, failed: 1, paused: 0 },
				isPaused: false
			}
		]);

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/maintenance',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data.queues)).toBe(true);
		expect(body.data.queues).toHaveLength(2);
		expect(body.data.refreshedAt).toBeTruthy();
	});

	it('returns 502 when status load fails', async () => {
		const statusMock = vi.mocked(getMaintenanceQueueStatus);
		statusMock.mockRejectedValueOnce(new Error('redis down'));

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/admin/maintenance',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error.code).toBe('MAINTENANCE_STATUS_FAILED');
	});
});

describe('POST /api/v1/admin/maintenance', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/admin/maintenance',
				authenticated: false,
				body: { jobs: ['expire-unused-uploads'] }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 403 for non-admin users', async () => {
		const event = createRequestEvent({
			method: 'POST',
			path: '/api/v1/admin/maintenance',
			authenticated: true,
			body: { jobs: ['expire-unused-uploads'] }
		}) as never;

		(event as { locals: { user: { role: string } } }).locals.user.role = 'user';

		const res = await POST(event);
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('returns 400 for missing jobs', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/admin/maintenance',
				authenticated: true,
				body: {}
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('returns 400 for unsupported jobs', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/admin/maintenance',
				authenticated: true,
				body: { jobs: ['something-else'] }
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});

	it('queues maintenance jobs and returns 202', async () => {
		const enqueueMock = vi.mocked(enqueueMaintenanceJobs);
		enqueueMock.mockResolvedValueOnce([
			{ job: 'expire-unused-uploads', id: 'job-1' },
			{ job: 'expire-expired-shares', id: 'job-2' }
		]);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/admin/maintenance',
				authenticated: true,
				body: {
					jobs: ['expire-unused-uploads', 'expire-expired-shares'],
					olderThanMinutes: 120
				}
			}) as never
		);

		expect(res.status).toBe(202);
		expect(enqueueMock).toHaveBeenCalledWith(['expire-unused-uploads', 'expire-expired-shares'], {
			olderThanMinutes: 120
		});

		const body = await res.json();
		expect(body.data.queued).toHaveLength(2);
	});

	it('returns 502 when queueing fails', async () => {
		const enqueueMock = vi.mocked(enqueueMaintenanceJobs);
		enqueueMock.mockRejectedValueOnce(new Error('redis down'));

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/admin/maintenance',
				authenticated: true,
				body: { jobs: ['expire-unused-uploads'] }
			}) as never
		);

		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error.code).toBe('MAINTENANCE_QUEUE_FAILED');
	});
});
