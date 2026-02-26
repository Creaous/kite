import { redirect } from '@sveltejs/kit';
import { getUpdateStatus } from '$lib/server/services/update-notifier';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/sign-in');
	}

	if (locals.user.role !== 'admin') {
		throw redirect(303, '/');
	}

	const updateStatus = await getUpdateStatus();

	return {
		user: locals.user,
		updateStatus
	};
};
