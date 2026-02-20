/*
 * This file is a messy hacky workaround but I am too tired to keep messing with this for another 2 hours...
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../db', async () => {
	const schemas = await import('../db/schema');

	const client = new PGlite();
	const { relations } = schemas;
	const db = drizzle({ client, relations });

	return {
		db,
		client
	};
});

beforeAll(async () => {
	const mod = await import('../db');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const db = mod.db as unknown as any;

	const schemas = await import('../db/schema');

	const { createRequire } = await vi.importActual<typeof import('node:module')>('node:module');
	const require = createRequire(import.meta.url);
	const { pushSchema } =
		require('drizzle-kit/api-postgres') as typeof import('drizzle-kit/api-postgres');

	const result = await pushSchema(schemas, db);
	if (result?.apply) {
		await result.apply();
	}
});

beforeEach(async () => {
	const { db } = await import('../db');

	await db.execute(sql`
		DO $$
		DECLARE
			rec RECORD;
		BEGIN
			FOR rec IN
				SELECT tablename
				FROM pg_tables
				WHERE schemaname = 'public'
			LOOP
				EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', rec.tablename);
			END LOOP;
		END $$;
	`);
});

afterAll(async () => {
	const mod = await import('../db');
	const client = mod.client as unknown as PGlite;

	if (typeof client.close === 'function') {
		await client.close();
	} else {
		console.warn('PGlite client does not have a close method; skipping');
	}
});
