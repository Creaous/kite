import 'dotenv/config';

import IORedis from 'ioredis';
import pg from 'pg';

const { Pool } = pg;

const REQUIRED_ENV_VARS = [
	'ORIGIN',
	'DATABASE_URL',
	'REDIS_URL',
	'BETTER_AUTH_SECRET',
	'TOKEN_SECRET'
];
const INVALID_SECRET_VALUES = new Set(['', 'default-build-secret', 'change-me']);

function fail(message) {
	console.error(`[predeploy] ${message}`);
	process.exit(1);
}

function assertRequiredEnv() {
	const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
	if (missing.length > 0) {
		fail(`Missing required environment variables: ${missing.join(', ')}`);
	}

	for (const key of ['BETTER_AUTH_SECRET', 'TOKEN_SECRET']) {
		const value = process.env[key]?.trim() ?? '';
		if (INVALID_SECRET_VALUES.has(value)) {
			fail(`${key} must be set to a strong secret value before deployment`);
		}
	}

	try {
		const origin = new URL(process.env.ORIGIN);
		if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
			fail('ORIGIN should use https in non-local deployments');
		}
	} catch {
		fail('ORIGIN must be a valid URL');
	}
}

async function assertDatabaseConnectivity() {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });

	try {
		const result = await pool.query('select 1 as ok');
		if (result.rows[0]?.ok !== 1) {
			fail('Database connectivity check returned an unexpected result');
		}
	} finally {
		await pool.end();
	}
}

async function assertRedisConnectivity() {
	const redis = new IORedis(process.env.REDIS_URL, {
		maxRetriesPerRequest: 1,
		enableReadyCheck: true,
		lazyConnect: true
	});

	try {
		await redis.connect();
		const pong = await redis.ping();
		if (pong !== 'PONG') {
			fail('Redis ping did not return PONG');
		}
	} finally {
		await redis.quit();
	}
}

async function main() {
	assertRequiredEnv();
	await assertDatabaseConnectivity();
	await assertRedisConnectivity();
	console.log('[predeploy] Environment and connectivity checks passed');
}

main().catch((error) => {
	console.error('[predeploy] Check failed:', error);
	process.exit(1);
});
