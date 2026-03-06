import { auth } from '$lib/server/auth';
import { getUpdateStatus } from '$lib/server/services/update-notifier';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type Role = 'user' | 'trusted' | 'admin';
type MaintenanceJob = 'expire-unused-uploads' | 'expire-expired-shares' | 'all';

async function apiJson(event: Parameters<PageServerLoad>[0], path: string, init?: RequestInit) {
	const response = await event.fetch(path, init);
	const body = await response.json().catch(() => ({}));
	return { response, body };
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(303, '/sign-in');
	}

	if (event.locals.user.role !== 'admin') {
		throw redirect(303, '/');
	}

	const search = event.url.searchParams.get('search')?.trim() ?? '';
	const usersQuery = new URLSearchParams({ limit: '100' });
	if (search) {
		usersQuery.set('search', search);
	}

	const [
		updateStatus,
		usersResult,
		brandingResult,
		authSettingsResult,
		alertSettingsResult,
		maintenanceResult
	] = await Promise.all([
		getUpdateStatus(),
		apiJson(event, `/api/v1/admin/users?${usersQuery.toString()}`),
		apiJson(event, '/api/v1/admin/branding'),
		apiJson(event, '/api/v1/admin/auth-settings'),
		apiJson(event, '/api/v1/admin/alert-settings'),
		apiJson(event, '/api/v1/admin/maintenance')
	]);

	return {
		user: event.locals.user,
		updateStatus,
		search,
		users: usersResult.response.ok ? (usersResult.body?.data?.users ?? []) : [],
		total: usersResult.response.ok ? (usersResult.body?.data?.total ?? 0) : 0,
		brandingSettings: brandingResult.response.ok ? (brandingResult.body?.data ?? null) : null,
		authSettingsData: authSettingsResult.response.ok
			? (authSettingsResult.body?.data ?? null)
			: null,
		alertSettingsData: alertSettingsResult.response.ok
			? (alertSettingsResult.body?.data ?? null)
			: null,
		maintenanceData: maintenanceResult.response.ok ? (maintenanceResult.body?.data ?? null) : null,
		loadErrors: {
			users: usersResult.response.ok
				? ''
				: (usersResult.body?.error?.message ?? 'Unable to load users.'),
			branding: brandingResult.response.ok
				? ''
				: (brandingResult.body?.error?.message ?? 'Unable to load branding settings.'),
			authSettings: authSettingsResult.response.ok
				? ''
				: (authSettingsResult.body?.error?.message ?? 'Unable to load auth settings.'),
			alertSettings: alertSettingsResult.response.ok
				? ''
				: (alertSettingsResult.body?.error?.message ?? 'Unable to load alert settings.'),
			maintenance: maintenanceResult.response.ok
				? ''
				: (maintenanceResult.body?.error?.message ?? 'Unable to load maintenance status.')
		}
	};
};

export const actions = {
	updateRole: async (event) => {
		const data = await event.request.formData();
		const userId = data.get('userId');
		const role = data.get('role');
		if (typeof userId !== 'string' || typeof role !== 'string') {
			return fail(400, { errorMessage: 'Invalid role update request.' });
		}

		if (role !== 'user' && role !== 'trusted' && role !== 'admin') {
			return fail(400, { errorMessage: 'Invalid role value.' });
		}

		const { response, body } = await apiJson(
			event as Parameters<PageServerLoad>[0],
			`/api/v1/admin/users/${userId}/role`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ role: role as Role })
			}
		);

		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to update role.'
			});
		}

		return { success: true, successMessage: 'Role updated.' };
	},
	toggleSuspension: async (event) => {
		const data = await event.request.formData();
		const userId = data.get('userId');
		const banned = data.get('banned') === 'true';
		if (typeof userId !== 'string') {
			return fail(400, { errorMessage: 'Invalid user action.' });
		}

		try {
			if (banned) {
				await auth.api.unbanUser({
					headers: event.request.headers,
					body: { userId }
				});
				return { success: true, successMessage: 'User unsuspended.' };
			}

			await auth.api.banUser({
				headers: event.request.headers,
				body: {
					userId,
					banReason: 'Suspended by admin'
				}
			});
			return { success: true, successMessage: 'User suspended.' };
		} catch {
			return fail(400, {
				errorMessage: banned ? 'Unable to unsuspend user.' : 'Unable to suspend user.'
			});
		}
	},
	impersonate: async (event) => {
		const data = await event.request.formData();
		const userId = data.get('userId');
		if (typeof userId !== 'string') {
			return fail(400, { errorMessage: 'Invalid impersonation request.' });
		}

		try {
			await auth.api.impersonateUser({
				headers: event.request.headers,
				body: { userId }
			});
		} catch {
			return fail(400, { errorMessage: 'Unable to impersonate user.' });
		}

		throw redirect(303, '/');
	},
	saveBranding: async (event) => {
		const data = await event.request.formData();

		const payload = {
			appName: (data.get('appName') as string) ?? '',
			tagline: (data.get('tagline') as string) ?? '',
			logoUrl: (data.get('logoUrl') as string) ?? '',
			faviconUrl: (data.get('faviconUrl') as string) ?? '',
			disableIndexing: data.get('disableIndexing') === 'on'
		};

		const { response, body } = await apiJson(
			event as Parameters<PageServerLoad>[0],
			'/api/v1/admin/branding',
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			}
		);

		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to save branding settings.'
			});
		}

		return { success: true, successMessage: 'Branding settings saved.' };
	},
	saveAuthSettings: async (event) => {
		const data = await event.request.formData();
		const enabledSocialProviders = data
			.getAll('enabledSocialProviders')
			.filter((value): value is string => typeof value === 'string');

		const payload = {
			registrationEnabled: data.get('registrationEnabled') === 'on',
			anonymousTokensEnabled: data.get('anonymousTokensEnabled') === 'on',
			publicApiEnabled: data.get('publicApiEnabled') === 'on',
			enabledSocialProviders
		};

		const { response, body } = await apiJson(
			event as Parameters<PageServerLoad>[0],
			'/api/v1/admin/auth-settings',
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			}
		);

		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to save auth settings.'
			});
		}

		return { success: true, successMessage: 'Auth settings saved.' };
	},
	saveAlertSettings: async (event) => {
		const data = await event.request.formData();
		const payload = {
			globalAnnouncement: {
				enabled: data.get('globalAnnouncementEnabled') === 'on',
				message: (data.get('globalAnnouncementMessage') as string) ?? '',
				type: (data.get('globalAnnouncementType') as string) ?? 'info'
			},
			shareFlowAlert: {
				enabled: data.get('shareFlowAlertEnabled') === 'on',
				message: (data.get('shareFlowAlertMessage') as string) ?? '',
				type: (data.get('shareFlowAlertType') as string) ?? 'info'
			}
		};

		const { response, body } = await apiJson(
			event as Parameters<PageServerLoad>[0],
			'/api/v1/admin/alert-settings',
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			}
		);

		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to save alert settings.'
			});
		}

		return { success: true, successMessage: 'Alert settings saved.' };
	},
	runMaintenance: async (event) => {
		const data = await event.request.formData();
		const job = data.get('job');
		if (job !== 'expire-unused-uploads' && job !== 'expire-expired-shares' && job !== 'all') {
			return fail(400, { errorMessage: 'Invalid maintenance job.' });
		}

		const jobs =
			job === 'all'
				? ['expire-unused-uploads', 'expire-expired-shares']
				: [job as Exclude<MaintenanceJob, 'all'>];
		const { response, body } = await apiJson(
			event as Parameters<PageServerLoad>[0],
			'/api/v1/admin/maintenance',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jobs })
			}
		);

		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to queue maintenance job.'
			});
		}

		const queued = Array.isArray(body?.data?.queued) ? body.data.queued.length : 0;
		return {
			success: true,
			successMessage:
				queued > 0 ? `Queued ${queued} maintenance job(s).` : 'Maintenance job queued.'
		};
	}
} satisfies Actions;
