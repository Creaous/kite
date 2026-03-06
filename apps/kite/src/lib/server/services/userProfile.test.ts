import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { user, userProfile } from '../db/schema';
import { getOrCreateUserProfile, markOnboardingCompleted } from './userProfile';

describe('userProfile service (db)', () => {
	const createdUserIds: string[] = [];

	afterEach(async () => {
		for (const userId of createdUserIds.splice(0)) {
			await db.delete(userProfile).where(eq(userProfile.userId, userId));
			await db.delete(user).where(eq(user.id, userId));
		}
	});

	async function createTestUser(userId: string) {
		await db.insert(user).values({
			id: userId,
			name: 'User Profile Test',
			email: `${userId}@example.com`,
			emailVerified: true
		});
		createdUserIds.push(userId);
	}

	it('creates default profile when missing', async () => {
		const userId = 'user-profile-test-1';
		await createTestUser(userId);

		const profile = await getOrCreateUserProfile(userId);

		expect(profile.onboardingCompleted).toBe(false);
		expect(profile.onboardingCompletedAt).toBeNull();

		const [row] = await db
			.select({ onboardingCompleted: userProfile.onboardingCompleted })
			.from(userProfile)
			.where(eq(userProfile.userId, userId))
			.limit(1);

		expect(row.onboardingCompleted).toBe(false);
	});

	it('marks onboarding as completed', async () => {
		const userId = 'user-profile-test-2';
		await createTestUser(userId);

		await markOnboardingCompleted(userId);

		const profile = await getOrCreateUserProfile(userId);
		expect(profile.onboardingCompleted).toBe(true);
		expect(profile.onboardingCompletedAt).toBeInstanceOf(Date);
	});

	it('upserts onboarding completion when profile does not exist', async () => {
		const userId = 'user-profile-test-3';
		await createTestUser(userId);

		await markOnboardingCompleted(userId);
		await markOnboardingCompleted(userId);

		const [row] = await db
			.select({
				onboardingCompleted: userProfile.onboardingCompleted,
				onboardingCompletedAt: userProfile.onboardingCompletedAt
			})
			.from(userProfile)
			.where(eq(userProfile.userId, userId))
			.limit(1);

		expect(row.onboardingCompleted).toBe(true);
		expect(row.onboardingCompletedAt).toBeTruthy();
	});
});
