import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { building } from '$app/environment';

import * as schemas from './schema';

const { relations } = schemas;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && !building) {
	throw new Error('DATABASE_URL is not defined in environment variables');
}

export const client = new Pool({
	connectionString: databaseUrl ?? 'postgres://postgres:postgres@localhost:5432/postgres'
});

export const db = drizzle({
	client,
	relations
});
