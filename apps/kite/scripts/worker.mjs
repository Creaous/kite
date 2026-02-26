import 'dotenv/config';

import { setTimeout as delay } from 'node:timers/promises';
import { rm } from 'node:fs/promises';

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import pg from 'pg';

const { Pool } = pg;

const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!redisUrl) {
	console.error('REDIS_URL is required for worker');
	process.exit(1);
}

if (!databaseUrl) {
	console.error('DATABASE_URL is required for worker');
	process.exit(1);
}

const QUEUE_EXPIRE_UNUSED_UPLOADS = 'maintenance_expire-unused-uploads';
const QUEUE_EXPIRE_EXPIRED_SHARES = 'maintenance_expire-expired-shares';

const unusedUploadExpiryMinutes = Number.parseInt(
	process.env.UNUSED_UPLOAD_EXPIRY_MINUTES ?? '120',
	10
);
const unusedUploadScanIntervalMs = Number.parseInt(
	process.env.UNUSED_UPLOAD_SCAN_INTERVAL_MS ?? '60000',
	10
);
const shareExpiryScanIntervalMs = Number.parseInt(
	process.env.SHARE_EXPIRY_SCAN_INTERVAL_MS ?? '60000',
	10
);

const redisConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const pool = new Pool({ connectionString: databaseUrl });

async function waitForDatabase(maxAttempts = 60, retryDelayMs = 2000) {
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await pool.query('select 1');
			return;
		} catch (error) {
			if (attempt === maxAttempts) throw error;
			console.log(
				`Database not ready (${attempt}/${maxAttempts}), retrying in ${retryDelayMs}ms...`
			);
			await delay(retryDelayMs);
		}
	}
}

async function processExpireUnusedUploads(olderThanMinutesOverride) {
	const now = new Date();
	const olderThanMinutes = Number.isFinite(olderThanMinutesOverride)
		? Math.max(1, Number(olderThanMinutesOverride))
		: unusedUploadExpiryMinutes;
	const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000);

	const { rows } = await pool.query(
		`
			WITH candidates AS (
				SELECT u.id, u.storage_path
				FROM uploads u
				LEFT JOIN share_upload su ON su.upload_id = u.id
				WHERE u.deleted_at IS NULL
					AND su.id IS NULL
					AND u.created_at < $1
			)
			UPDATE uploads u
			SET deleted_at = $2, updated_at = $2
			FROM candidates c
			WHERE u.id = c.id
			RETURNING u.id, c.storage_path
		`,
		[cutoff, now]
	);

	let removedFromDisk = 0;
	for (const row of rows) {
		if (!row.storage_path) continue;

		const stillReferenced = await pool.query(
			`SELECT 1 FROM uploads WHERE deleted_at IS NULL AND storage_path = $1 LIMIT 1`,
			[row.storage_path]
		);

		if (stillReferenced.rowCount > 0) continue;

		await rm(row.storage_path, { force: true }).catch(() => undefined);
		removedFromDisk += 1;
	}

	return { expiredUploads: rows.length, removedFromDisk, olderThanMinutes };
}

async function processExpireExpiredShares() {
	const now = new Date();
	const { rows } = await pool.query(
		`
			UPDATE shares
			SET status = 'expired', updated_at = $1
			WHERE status = 'active'
				AND deleted_at IS NULL
				AND expires_at IS NOT NULL
				AND expires_at < $1
			RETURNING id, high_sensitivity
		`,
		[now]
	);

	return {
		expiredShares: rows.length,
		expiredHighSensitivityShares: rows.filter((row) => row.high_sensitivity).length
	};
}

const expireUnusedUploadsQueue = new Queue(QUEUE_EXPIRE_UNUSED_UPLOADS, {
	connection: redisConnection,
	defaultJobOptions: {
		removeOnComplete: 200,
		removeOnFail: 200,
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000
		}
	}
});

const expireExpiredSharesQueue = new Queue(QUEUE_EXPIRE_EXPIRED_SHARES, {
	connection: redisConnection,
	defaultJobOptions: {
		removeOnComplete: 200,
		removeOnFail: 200,
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000
		}
	}
});

const expireUnusedUploadsEvents = new QueueEvents(QUEUE_EXPIRE_UNUSED_UPLOADS, {
	connection: redisConnection
});
const expireExpiredSharesEvents = new QueueEvents(QUEUE_EXPIRE_EXPIRED_SHARES, {
	connection: redisConnection
});

expireUnusedUploadsEvents.on('failed', ({ jobId, failedReason }) => {
	console.error(`[${QUEUE_EXPIRE_UNUSED_UPLOADS}] job ${jobId} failed: ${failedReason}`);
});

expireExpiredSharesEvents.on('failed', ({ jobId, failedReason }) => {
	console.error(`[${QUEUE_EXPIRE_EXPIRED_SHARES}] job ${jobId} failed: ${failedReason}`);
});

const expireUnusedUploadsWorker = new Worker(
	QUEUE_EXPIRE_UNUSED_UPLOADS,
	async (job) => {
		const result = await processExpireUnusedUploads(job?.data?.olderThanMinutes);
		console.log(`[${QUEUE_EXPIRE_UNUSED_UPLOADS}]`, result);
		return result;
	},
	{ connection: redisConnection, concurrency: 1 }
);

const expireExpiredSharesWorker = new Worker(
	QUEUE_EXPIRE_EXPIRED_SHARES,
	async () => {
		const result = await processExpireExpiredShares();
		console.log(`[${QUEUE_EXPIRE_EXPIRED_SHARES}]`, result);
		return result;
	},
	{ connection: redisConnection, concurrency: 1 }
);

async function setupSchedulers() {
	await expireUnusedUploadsQueue.upsertJobScheduler(
		'every-interval',
		{ every: unusedUploadScanIntervalMs },
		{
			name: 'expire-unused-uploads',
			data: { unusedUploadExpiryMinutes }
		}
	);

	await expireExpiredSharesQueue.upsertJobScheduler(
		'every-interval',
		{ every: shareExpiryScanIntervalMs },
		{
			name: 'expire-expired-shares',
			data: {}
		}
	);

	console.log('BullMQ schedulers configured', {
		unusedUploadScanIntervalMs,
		shareExpiryScanIntervalMs,
		unusedUploadExpiryMinutes
	});
}

async function shutdown(signal, exitCode = 0) {
	console.log(`Received ${signal}; shutting down worker...`);
	await Promise.allSettled([
		expireUnusedUploadsWorker.close(),
		expireExpiredSharesWorker.close(),
		expireUnusedUploadsEvents.close(),
		expireExpiredSharesEvents.close(),
		expireUnusedUploadsQueue.close(),
		expireExpiredSharesQueue.close(),
		pool.end(),
		redisConnection.quit()
	]);
	process.exit(exitCode);
}

process.on('SIGINT', () => {
	void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
	void shutdown('SIGTERM');
});

try {
	await waitForDatabase();
	await setupSchedulers();
	console.log('BullMQ maintenance worker started');
} catch (error) {
	console.error('Failed to start worker:', error);
	await shutdown('startup-error', 1);
}
