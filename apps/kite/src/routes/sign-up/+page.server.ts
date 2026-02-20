import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { authSettings } = await parent();

	if (!authSettings.registrationEnabled) {
		throw redirect(303, '/sign-in?registrationDisabled=1');
	}

	return {};
};
