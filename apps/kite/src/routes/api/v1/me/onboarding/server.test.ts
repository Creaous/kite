import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '$lib/server/test/request-event';
import { POST } from './+server';

vi.mock('$lib/server/services/userProfile', () => ({
	markOnboardingCompleted: vi.fn()
}));

import { markOnboardingCompleted } from '$lib/server/services/userProfile';

describe('POST /api/v1/me/onboarding', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 for unauthenticated users', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/me/onboarding',
				authenticated: false
			}) as never
		);

		expect(res.status).toBe(401);
		expect(markOnboardingCompleted).not.toHaveBeenCalled();
	});

	it('marks onboarding complete for authenticated users', async () => {
		const markOnboardingCompletedMock = vi.mocked(markOnboardingCompleted);
		markOnboardingCompletedMock.mockResolvedValueOnce(undefined);

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/me/onboarding',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		expect(markOnboardingCompletedMock).toHaveBeenCalledWith('test-user-id');
		const body = await res.json();
		expect(body.data.onboardingCompleted).toBe(true);
	});

	it('returns 500 when profile update fails', async () => {
		const markOnboardingCompletedMock = vi.mocked(markOnboardingCompleted);
		markOnboardingCompletedMock.mockRejectedValueOnce(new Error('db-failure'));

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/me/onboarding',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error.code).toBe('ONBOARDING_UPDATE_FAILED');
	});
});
