import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('$lib/server/auth', () => ({
	isAnonymousEnabled: true,
	isEmailAndPasswordEnabled: true
}));

vi.mock('$lib/server/auth-providers', () => ({
	getConfiguredSocialProvidersFromEnv: vi.fn(() => ({ configuredProviderIds: ['github'] }))
}));

vi.mock('$lib/server/services/settings', () => ({
	getBrandingSettings: vi.fn(async () => ({ appName: 'Kite', disableIndexing: true })),
	getAlertSettings: vi.fn(async () => ({
		globalAnnouncement: { enabled: false, message: '', type: 'info' },
		shareFlowAlert: { enabled: false, message: '', type: 'info' }
	})),
	getAuthSettings: vi.fn(async () => ({
		registrationEnabled: true,
		anonymousTokensEnabled: true,
		publicApiEnabled: true,
		enabledSocialProviders: ['github']
	}))
}));

vi.mock('$lib/server/services/userProfile', () => ({
	getOrCreateUserProfile: vi.fn(async () => ({
		onboardingCompleted: false,
		onboardingCompletedAt: null
	}))
}));

import { load } from './+layout.server';
import { getOrCreateUserProfile } from '$lib/server/services/userProfile';

describe('+layout.server load', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('redirects unauthenticated users on private routes', async () => {
		await expect(
			load({
				locals: {},
				url: new URL('http://localhost/shares?tab=active')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/sign-in?next=%2Fshares%3Ftab%3Dactive'
		});
	});

	it('redirects authenticated users away from sign-in', async () => {
		await expect(
			load({
				locals: {
					user: { id: 'u1', email: 'u1@example.com', role: 'user' }
				},
				url: new URL('http://localhost/sign-in')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});

	it('returns null profile for unauthenticated public paths', async () => {
		const result = (await load({
			locals: {},
			url: new URL('http://localhost/sign-in')
		} as never)) as { user: null; userProfile: null };

		expect(result.user).toBeNull();
		expect(result.userProfile).toBeNull();
		expect(getOrCreateUserProfile).not.toHaveBeenCalled();
	});

	it('includes userProfile in load output for authenticated users', async () => {
		const result = (await load({
			locals: {
				user: {
					id: 'u2',
					email: 'u2@example.com',
					role: 'admin'
				},
				session: {
					id: 's1',
					userId: 'u2',
					token: 'token',
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date()
				}
			},
			url: new URL('http://localhost/shares')
		} as never)) as { userProfile: { onboardingCompleted: boolean; onboardingCompletedAt: null } };

		expect(getOrCreateUserProfile).toHaveBeenCalledWith('u2');
		expect(result.userProfile).toEqual({
			onboardingCompleted: false,
			onboardingCompletedAt: null
		});
	});
});
