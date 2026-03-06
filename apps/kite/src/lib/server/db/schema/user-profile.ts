import { defineRelations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

export const userProfile = pgTable(
	'user_profile',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => user.id, { onDelete: 'cascade' }),
		onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
		onboardingCompletedAt: timestamp('onboarding_completed_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('user_profile_onboardingCompleted_idx').on(table.onboardingCompleted)]
);

export const relations = defineRelations({ user, userProfile }, (r) => ({
	userProfile: {
		user: r.one.user({
			from: r.userProfile.userId,
			to: r.user.id
		})
	}
}));
