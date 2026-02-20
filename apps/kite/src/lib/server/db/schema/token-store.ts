import { index, pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const tokenStore = pgTable(
	'token_store',
	{
		token: text('token').primaryKey(),
		subject: text('subject'),
		purpose: text('purpose'),
		expiresAt: timestamp('expires_at').notNull(),
		used: boolean('used').default(false).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('token_store_expiresAt_idx').on(table.expiresAt)]
);
