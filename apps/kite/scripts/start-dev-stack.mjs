import 'dotenv/config';

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import IORedis from 'ioredis';
import pg from 'pg';

const { Pool } = pg;

const READY_URL = process.env.DEV_APP_READY_URL ?? 'http://127.0.0.1:5173/sign-in';
const DB_CONNECT_RETRIES = Number.parseInt(process.env.DEV_STACK_DB_RETRIES ?? '45', 10);
const REDIS_CONNECT_RETRIES = Number.parseInt(process.env.DEV_STACK_REDIS_RETRIES ?? '45', 10);
const APP_READY_RETRIES = Number.parseInt(process.env.DEV_STACK_APP_RETRIES ?? '90', 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.DEV_STACK_RETRY_DELAY_MS ?? '1000', 10);

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: 'inherit',
			env: process.env,
			...options
		});

		child.on('exit', (code) => {
			if (code === 0) return resolve();
			reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
		});
		child.on('error', reject);
	});
}

async function waitForPostgres() {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });

	try {
		for (let attempt = 1; attempt <= DB_CONNECT_RETRIES; attempt += 1) {
			try {
				await pool.query('select 1');
				return;
			} catch (error) {
				if (attempt === DB_CONNECT_RETRIES) throw error;
				console.log(
					`[dev-stack] postgres not ready (${attempt}/${DB_CONNECT_RETRIES}); retrying...`
				);
				await delay(RETRY_DELAY_MS);
			}
		}
	} finally {
		await pool.end();
	}
}

async function waitForRedis() {
	for (let attempt = 1; attempt <= REDIS_CONNECT_RETRIES; attempt += 1) {
		const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
			maxRetriesPerRequest: 1,
			enableReadyCheck: true,
			lazyConnect: true
		});

		try {
			await redis.connect();
			const pong = await redis.ping();
			if (pong === 'PONG') return;
		} catch (error) {
			if (attempt === REDIS_CONNECT_RETRIES) throw error;
			console.log(`[dev-stack] redis not ready (${attempt}/${REDIS_CONNECT_RETRIES}); retrying...`);
			await delay(RETRY_DELAY_MS);
		} finally {
			await redis.quit().catch(() => undefined);
		}
	}
}

async function waitForAppReady() {
	for (let attempt = 1; attempt <= APP_READY_RETRIES; attempt += 1) {
		try {
			const response = await fetch(READY_URL, { redirect: 'manual' });
			if (response.status >= 200 && response.status < 500) {
				return;
			}
		} catch {
			// Keep retrying while Vite starts.
		}

		if (attempt === APP_READY_RETRIES) {
			throw new Error(`App readiness check failed after ${APP_READY_RETRIES} attempts (${READY_URL})`);
		}

		if (attempt % 10 === 0) {
			console.log(`[dev-stack] waiting for app readiness (${attempt}/${APP_READY_RETRIES})...`);
		}

		await delay(RETRY_DELAY_MS);
	}
}

function spawnLongRunning(command, args, name) {
	const child = spawn(command, args, {
		stdio: 'inherit',
		env: process.env
	});

	child.on('error', (error) => {
		console.error(`[dev-stack] ${name} process error:`, error);
		process.exit(1);
	});

	return child;
}

function attachShutdown(children) {
	let shuttingDown = false;

	const stopAll = (signal = 'SIGTERM') => {
		if (shuttingDown) return;
		shuttingDown = true;

		for (const child of children) {
			if (!child.killed) {
				child.kill(signal);
			}
		}
	};

	process.on('SIGINT', () => stopAll('SIGINT'));
	process.on('SIGTERM', () => stopAll('SIGTERM'));
}

async function main() {
	console.log('[dev-stack] starting postgres and redis with docker compose...');
	await run('docker', ['compose', 'up', '-d', 'postgres', 'redis']);

	console.log('[dev-stack] waiting for postgres...');
	await waitForPostgres();

	console.log('[dev-stack] waiting for redis...');
	await waitForRedis();

	console.log('[dev-stack] launching worker and Vite dev server...');
	const worker = spawnLongRunning('pnpm', ['worker'], 'worker');
	const app = spawnLongRunning('pnpm', ['dev', '--host', '0.0.0.0'], 'app');
	attachShutdown([worker, app]);

	await waitForAppReady();
	console.log(`[dev-stack] ready: app reachable at ${READY_URL}`);

	const [workerCode, appCode] = await Promise.race([
		new Promise((resolve) => worker.on('exit', (code) => resolve(['worker', code]))),
		new Promise((resolve) => app.on('exit', (code) => resolve(['app', code])))
	]);

	console.error(`[dev-stack] ${workerCode} process exited`);
	process.exit(typeof appCode === 'number' ? appCode : 1);
}

main().catch((error) => {
	console.error('[dev-stack] failed:', error);
	process.exit(1);
});
