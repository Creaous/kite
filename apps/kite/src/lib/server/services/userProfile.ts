import { eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';

export type UserProfileState = {
	onboardingCompleted: boolean;
	onboardingCompletedAt: Date | null;
};

const DEFAULT_PROFILE: UserProfileState = {
	onboardingCompleted: false,
	onboardingCompletedAt: null
};

export async function getOrCreateUserProfile(userId: string): Promise<UserProfileState> {
	await db.insert(userProfile).values({ userId }).onConflictDoNothing();

	const [profile] = await db
		.select({
			onboardingCompleted: userProfile.onboardingCompleted,
			onboardingCompletedAt: userProfile.onboardingCompletedAt
		})
		.from(userProfile)
		.where(eq(userProfile.userId, userId))
		.limit(1);

	if (!profile) {
		return DEFAULT_PROFILE;
	}

	return profile;
}

export async function markOnboardingCompleted(userId: string) {
	const now = new Date();

	await db
		.insert(userProfile)
		.values({
			userId,
			onboardingCompleted: true,
			onboardingCompletedAt: now
		})
		.onConflictDoUpdate({
			target: userProfile.userId,
			set: {
				onboardingCompleted: true,
				onboardingCompletedAt: now,
				updatedAt: now
			}
		});
}
