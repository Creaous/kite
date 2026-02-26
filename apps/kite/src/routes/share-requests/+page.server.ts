import type { PageServerLoad } from './$types';
import { isShareRequestEmailConfigured } from '$lib/server/services/shareRequestEmail';

export const load: PageServerLoad = async () => {
	return {
		smtpConfigured: isShareRequestEmailConfigured()
	};
};
