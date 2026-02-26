import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { shares } from './share';
import { uploads } from './upload';

/**
 * Junction table for many-to-many relationship between shares and uploads
 * Allows deduplicated files to be shared across multiple shares
 *
 * Indexes optimized for:
 * - Looking up all uploads for a share (shareId index)
 * - Looking up all shares using an upload (uploadId index)
 * - Preventing duplicate share-upload pairs (unique constraint)
 */
export const shareUpload = pgTable(
	'share_upload',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		shareId: uuid('share_id')
			.notNull()
			.references(() => shares.id, { onDelete: 'cascade' }),
		uploadId: uuid('upload_id')
			.notNull()
			.references(() => uploads.id, { onDelete: 'restrict' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		// Index for looking up all uploads in a share (most common query)
		index('share_upload_shareId_idx').on(table.shareId),
		// Index for looking up all shares using an upload (for deduplication checks)
		index('share_upload_uploadId_idx').on(table.uploadId),
		// Unique constraint to prevent duplicate share-upload pairs
		unique('share_upload_unique_pair').on(table.shareId, table.uploadId)
	]
);
