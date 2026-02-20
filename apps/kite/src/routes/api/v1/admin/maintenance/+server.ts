import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { includesInternalError } from '$lib/server/api-errors';
import { requireAdminUser } from '$lib/server/http-auth';
import {
	enqueueMaintenanceJobs,
	getMaintenanceQueueStatus,
	type MaintenanceJobName
} from '$lib/server/queues/maintenance';

const ALLOWED_JOBS: MaintenanceJobName[] = ['expire-unused-uploads', 'expire-expired-shares'];

function isAllowedJob(value: unknown): value is MaintenanceJobName {
	return typeof value === 'string' && ALLOWED_JOBS.includes(value as MaintenanceJobName);
}

export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const queues = await getMaintenanceQueueStatus();
		return json(
			{
				data: {
					queues,
					refreshedAt: new Date().toISOString()
				}
			},
			{ status: 200 }
		);
	} catch {
		return json(
			{
				error: {
					code: 'MAINTENANCE_STATUS_FAILED',
					message: 'Failed to load maintenance status'
				}
			},
			{ status: 502 }
		);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const body = await request.json().catch(() => ({}));

	const bodyJobs = Array.isArray(body?.jobs) ? body.jobs : body?.job ? [body.job] : null;
	if (!bodyJobs || bodyJobs.length === 0) {
		return json({ error: { code: 'INVALID_INPUT', message: 'jobs is required' } }, { status: 400 });
	}

	const jobs = bodyJobs.filter(isAllowedJob);
	if (jobs.length !== bodyJobs.length) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'Unsupported maintenance job' } },
			{ status: 400 }
		);
	}

	const olderThanMinutesRaw = body?.olderThanMinutes;
	const olderThanMinutes =
		typeof olderThanMinutesRaw === 'number' && Number.isFinite(olderThanMinutesRaw)
			? Math.max(1, Math.floor(olderThanMinutesRaw))
			: undefined;

	try {
		const queued = await enqueueMaintenanceJobs(jobs, { olderThanMinutes });
		return json({ data: { queued } }, { status: 202 });
	} catch (error) {
		const status = includesInternalError(error, 'REDIS_URL') ? 500 : 502;
		return json(
			{
				error: {
					code: 'MAINTENANCE_QUEUE_FAILED',
					message: 'Failed to queue maintenance jobs'
				}
			},
			{ status }
		);
	}
};
