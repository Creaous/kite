import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAuthenticatedUser } from '$lib/server/http-auth';
import { markOnboardingCompleted } from '$lib/server/services/userProfile';

export const POST: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		await markOnboardingCompleted(locals.user.id);
		return json({ data: { onboardingCompleted: true } }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'ONBOARDING_UPDATE_FAILED', message: 'Failed to save onboarding state' } },
			{ status: 500 }
		);
	}
};
