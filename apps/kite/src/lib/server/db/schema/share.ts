import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const shareStatus = pgEnum('share_status', ['active', 'expired', 'deleted']);
export const requestStatus = pgEnum('request_status', ['open', 'fulfilled', 'expired', 'deleted']);

export const shares = pgTable(
	'shares',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		code: text('code').notNull().unique(),
		title: text('title'),
		passwordHash: text('password_hash'),
		passwordProtected: boolean('password_protected').default(false).notNull(),
		message: text('message'),
		hideMessageBehindPassword: boolean('hide_message_behind_password').default(false).notNull(),
		expiresAt: timestamp('expires_at'),
		status: shareStatus('status').default('active').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		maxDownloads: integer('max_downloads').default(0).notNull(),
		downloadCount: integer('download_count').default(0).notNull(),
		viewCount: integer('view_count').default(0).notNull(),
		lastViewedAt: timestamp('last_viewed_at'),
		lastDownloadedAt: timestamp('last_downloaded_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [
		index('shares_code_idx').on(table.code),
		index('shares_expiresAt_idx').on(table.expiresAt),
		index('shares_createdBy_idx').on(table.createdBy)
	]
);

export const shareRequests = pgTable(
	'share_requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		code: text('code').unique(),
		title: text('title'),
		message: text('message'),
		requesterName: text('requester_name'),
		requesterEmail: text('requester_email'),
		expiresAt: timestamp('expires_at'),
		status: requestStatus('status').default('open').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [
		index('share_requests_code_idx').on(table.code),
		index('share_requests_status_idx').on(table.status),
		index('share_requests_expiresAt_idx').on(table.expiresAt)
	]
);
