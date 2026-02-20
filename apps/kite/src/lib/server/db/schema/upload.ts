import {
	uuid,
	bigint,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const uploadStatus = pgEnum('upload_status', [
	'pending',
	'uploading',
	'processing',
	'ready',
	'failed',
	'cancelled'
]);

export const uploads = pgTable(
	'uploads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		fingerprint: text('fingerprint').notNull(),
		filename: text('filename'),
		relativePath: text('relative_path'),
		size: bigint('size', { mode: 'number' }).notNull(),
		mimeType: text('mime_type'),
		chunkSize: integer('chunk_size'),
		uploadedBytes: bigint('uploaded_bytes', { mode: 'number' }).notNull().default(0),
		status: uploadStatus('status').notNull().default('pending'),
		storageProvider: text('storage_provider'),
		storagePath: text('storage_path'),
		hash: text('hash'),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [
		index('uploads_uploadedBy_idx').on(table.uploadedBy),
		index('uploads_fingerprint_idx').on(table.fingerprint),
		index('uploads_status_idx').on(table.status),
		index('uploads_createdAt_idx').on(table.createdAt)
	]
);
