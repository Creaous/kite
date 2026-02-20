import { index, pgTable, text, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
	'audit_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		actorId: text('actor_id'),
		action: text('action').notNull(),
		resourceType: text('resource_type'),
		resourceId: text('resource_id'),
		payload: jsonb('payload'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('audit_log_resource_idx').on(table.resourceType, table.resourceId)]
);
