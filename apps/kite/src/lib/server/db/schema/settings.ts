import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Settings table for storing application configuration
 * Uses key-value pairs for flexible configuration storage
 */
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
