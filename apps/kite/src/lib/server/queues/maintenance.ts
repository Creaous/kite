import { Queue } from 'bullmq';

export const EXPIRE_UNUSED_UPLOADS_QUEUE = 'maintenance_expire-unused-uploads';
export const EXPIRE_EXPIRED_SHARES_QUEUE = 'maintenance_expire-expired-shares';

export type MaintenanceJobName = 'expire-unused-uploads' | 'expire-expired-shares';

export type MaintenanceQueueStatus = {
	job: MaintenanceJobName;
	counts: {
		waiting: number;
		active: number;
		delayed: number;
		completed: number;
		failed: number;
		paused: number;
	};
	isPaused: boolean;
	latestResult: {
		expiredUploads?: number;
		removedFromDisk?: number;
		expiredShares?: number;
		expiredHighSensitivityShares?: number;
	} | null;
};

type QueueBundle = {
	expireUnusedUploads: Queue;
	expireExpiredShares: Queue;
};

const EMPTY_COUNTS = {
	waiting: 0,
	active: 0,
	delayed: 0,
	completed: 0,
	failed: 0,
	paused: 0
};

let queues: QueueBundle | null = null;

function readNumericCounter(input: unknown) {
	return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}

async function readLatestResult(queue: Queue) {
	const [latestCompleted] = await queue.getJobs(['completed'], 0, 0, false);
	if (!latestCompleted || typeof latestCompleted.returnvalue !== 'object') {
		return null;
	}

	const returnValue = latestCompleted.returnvalue as Record<string, unknown>;
	const result = {
		expiredUploads: readNumericCounter(returnValue.expiredUploads),
		removedFromDisk: readNumericCounter(returnValue.removedFromDisk),
		expiredShares: readNumericCounter(returnValue.expiredShares),
		expiredHighSensitivityShares: readNumericCounter(returnValue.expiredHighSensitivityShares)
	};

	if (
		result.expiredUploads === undefined &&
		result.removedFromDisk === undefined &&
		result.expiredShares === undefined &&
		result.expiredHighSensitivityShares === undefined
	) {
		return null;
	}

	return result;
}

function getRedisUrl() {
	const redisUrl = process.env.REDIS_URL;
	if (!redisUrl) {
		throw new Error('REDIS_URL is not configured');
	}

	return redisUrl;
}

function getQueues() {
	if (queues) return queues;
	const redisUrl = new URL(getRedisUrl());
	const redisDb = redisUrl.pathname.replace(/^\//, '');
	const connection = {
		host: redisUrl.hostname,
		port: Number(redisUrl.port || 6379),
		username: redisUrl.username || undefined,
		password: redisUrl.password || undefined,
		db: redisDb ? Number(redisDb) : undefined,
		tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
		maxRetriesPerRequest: null
	};

	queues = {
		expireUnusedUploads: new Queue(EXPIRE_UNUSED_UPLOADS_QUEUE, { connection }),
		expireExpiredShares: new Queue(EXPIRE_EXPIRED_SHARES_QUEUE, { connection })
	};

	return queues;
}

function isRecoverableQueueStatusError(error: unknown) {
	if (!(error instanceof Error)) return false;

	const message = error.message.toLowerCase();
	return (
		message.includes('undeclared key') ||
		message.includes('error running script') ||
		message.includes('user_script')
	);
}

async function readQueueStatus(
	job: MaintenanceJobName,
	queue: Queue
): Promise<MaintenanceQueueStatus> {
	try {
		const [counts, paused, latestResult] = await Promise.all([
			queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
			queue.isPaused(),
			readLatestResult(queue)
		]);

		return {
			job,
			counts: {
				waiting: counts.waiting ?? 0,
				active: counts.active ?? 0,
				delayed: counts.delayed ?? 0,
				completed: counts.completed ?? 0,
				failed: counts.failed ?? 0,
				paused: counts.paused ?? 0
			},
			isPaused: paused,
			latestResult
		};
	} catch (error) {
		if (!isRecoverableQueueStatusError(error)) {
			throw error;
		}

		return {
			job,
			counts: { ...EMPTY_COUNTS },
			isPaused: false,
			latestResult: null
		};
	}
}

export async function enqueueMaintenanceJobs(
	jobs: MaintenanceJobName[],
	options?: { olderThanMinutes?: number }
) {
	const bundle = getQueues();
	const created: { job: MaintenanceJobName; id: string | undefined }[] = [];

	for (const job of jobs) {
		if (job === 'expire-unused-uploads') {
			const queued = await bundle.expireUnusedUploads.add(
				'expire-unused-uploads',
				{ olderThanMinutes: Math.max(1, options?.olderThanMinutes ?? 60) },
				{ removeOnComplete: 200, removeOnFail: 200 }
			);
			created.push({ job, id: queued.id?.toString() });
			continue;
		}

		const queued = await bundle.expireExpiredShares.add(
			'expire-expired-shares',
			{},
			{ removeOnComplete: 200, removeOnFail: 200 }
		);
		created.push({ job, id: queued.id?.toString() });
	}

	return created;
}

export async function getMaintenanceQueueStatus(): Promise<MaintenanceQueueStatus[]> {
	const bundle = getQueues();

	return Promise.all([
		readQueueStatus('expire-unused-uploads', bundle.expireUnusedUploads),
		readQueueStatus('expire-expired-shares', bundle.expireExpiredShares)
	]);
}
