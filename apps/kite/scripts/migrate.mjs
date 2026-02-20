import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const migrationsFolder =
	process.env.DRIZZLE_MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
const maxRetries = Number.parseInt(process.env.DB_CONNECT_MAX_RETRIES ?? '30', 10);
const retryDelayMs = Number.parseInt(process.env.DB_CONNECT_RETRY_DELAY_MS ?? '2000', 10);
const migrateMaxAttempts = Number.parseInt(process.env.DB_MIGRATE_MAX_ATTEMPTS ?? '3', 10);

if (!existsSync(migrationsFolder)) {
	console.warn(`No migrations directory found at: ${migrationsFolder}`);
	console.warn('Skipping migration step. Generate migrations with: pnpm db:generate');
	process.exit(0);
}

async function waitForDatabase(pool) {
	for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
		try {
			await pool.query('select 1');
			return;
		} catch (error) {
			if (attempt === maxRetries) throw error;
			console.log(error);
			console.log(
				`Database not ready (${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`
			);
			await delay(retryDelayMs);
		}
	}
}

function isRetryableConnectionError(error) {
	const code = error?.code ?? error?.cause?.code;
	if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return true;

	const nested = error?.cause?.errors;
	if (Array.isArray(nested)) {
		return nested.some((entry) =>
			['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(entry?.code)
		);
	}

	return false;
}

let migrationsComplete = false;

for (let attempt = 1; attempt <= migrateMaxAttempts; attempt += 1) {
	const pool = new Pool({ connectionString: databaseUrl });

	try {
		await waitForDatabase(pool);
		const db = drizzle({ client: pool });
		console.log(`Running Drizzle migrations from: ${migrationsFolder}`);
		await migrate(db, { migrationsFolder });
		migrationsComplete = true;
		console.log('Drizzle migrations complete');
		break;
	} catch (error) {
		if (!isRetryableConnectionError(error) || attempt === migrateMaxAttempts) {
			console.error('Migration failed:', error);
			process.exitCode = 1;
			break;
		}

		console.log(
			`Migration connection failed (${attempt}/${migrateMaxAttempts}), retrying in ${retryDelayMs}ms...`
		);
		await delay(retryDelayMs);
	} finally {
		await pool.end();
	}
}

if (!migrationsComplete && process.exitCode !== 1) {
	process.exitCode = 1;
}
