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
	const userRole = event.url.searchParams.get('userRole')?.trim() ?? '';
	const userStatus = event.url.searchParams.get('userStatus')?.trim() ?? '';
	const userPageRaw = Number(event.url.searchParams.get('userPage') ?? 1);
	const userPageSizeRaw = Number(event.url.searchParams.get('userPageSize') ?? 25);
	const userPage = Number.isFinite(userPageRaw) ? Math.max(1, Math.floor(userPageRaw)) : 1;
	const userPageSize = Number.isFinite(userPageSizeRaw)
		? Math.min(100, Math.max(10, Math.floor(userPageSizeRaw)))
		: 25;
	const userOffset = (userPage - 1) * userPageSize;
	const auditQuery = event.url.searchParams.get('auditQ')?.trim() ?? '';
	const auditAction = event.url.searchParams.get('auditAction')?.trim() ?? '';
	const auditMethod = event.url.searchParams.get('auditMethod')?.trim() ?? '';
	const auditPath = event.url.searchParams.get('auditPath')?.trim() ?? '';
	const auditStatus = event.url.searchParams.get('auditStatus')?.trim() ?? '';
	const auditActorId = event.url.searchParams.get('auditActorId')?.trim() ?? '';
	const auditFrom = event.url.searchParams.get('auditFrom')?.trim() ?? '';
	const auditTo = event.url.searchParams.get('auditTo')?.trim() ?? '';
	const auditPageRaw = Number(event.url.searchParams.get('auditPage') ?? 1);
	const auditPageSizeRaw = Number(event.url.searchParams.get('auditPageSize') ?? 25);
	const auditPage = Number.isFinite(auditPageRaw) ? Math.max(1, Math.floor(auditPageRaw)) : 1;
	const auditPageSize = Number.isFinite(auditPageSizeRaw)
		? Math.min(200, Math.max(10, Math.floor(auditPageSizeRaw)))
		: 25;
	const auditOffset = (auditPage - 1) * auditPageSize;

	const usersQuery = new URLSearchParams({
		limit: String(userPageSize),
		offset: String(userOffset)
	});
	if (search) {
		usersQuery.set('search', search);
	}
	if (userRole) {
		usersQuery.set('role', userRole);
	}
	if (userStatus) {
		usersQuery.set('status', userStatus);
	}

	const auditLogsQuery = new URLSearchParams({
		limit: String(auditPageSize),
		offset: String(auditOffset)
	});
	if (auditQuery) auditLogsQuery.set('q', auditQuery);
	if (auditAction) auditLogsQuery.set('action', auditAction);
	if (auditMethod) auditLogsQuery.set('method', auditMethod);
	if (auditPath) auditLogsQuery.set('path', auditPath);
	if (auditStatus) auditLogsQuery.set('status', auditStatus);
	if (auditActorId) auditLogsQuery.set('actorId', auditActorId);
	if (auditFrom) auditLogsQuery.set('from', auditFrom);
	if (auditTo) auditLogsQuery.set('to', auditTo);

	const [
		updateStatus,
		usersResult,
		brandingResult,
		authSettingsResult,
		alertSettingsResult,
		maintenanceResult,
		auditLogsResult
	] = await Promise.all([
		getUpdateStatus(),
		apiJson(event, `/api/v1/admin/users?${usersQuery.toString()}`),
		apiJson(event, '/api/v1/admin/branding'),
		apiJson(event, '/api/v1/admin/auth-settings'),
		apiJson(event, '/api/v1/admin/alert-settings'),
		apiJson(event, '/api/v1/admin/maintenance'),
		apiJson(event, `/api/v1/admin/audit-logs?${auditLogsQuery.toString()}`)
	]);

	const auditTotal = auditLogsResult.response.ok
		? Number(auditLogsResult.body?.data?.total ?? 0)
		: 0;
	const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));
	const userTotal = usersResult.response.ok ? Number(usersResult.body?.data?.total ?? 0) : 0;
	const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize));

	return {
		user: event.locals.user,
		updateStatus,
		search,
		userFilters: {
			search,
			role: userRole,
			status: userStatus
		},
		userPagination: {
			page: Math.min(userPage, userTotalPages),
			pageSize: userPageSize,
			total: userTotal,
			totalPages: userTotalPages,
			hasPrev: userPage > 1,
			hasNext: userPage < userTotalPages
		},
		auditFilters: {
			q: auditQuery,
			action: auditAction,
			method: auditMethod,
			path: auditPath,
			status: auditStatus,
			actorId: auditActorId,
			from: auditFrom,
			to: auditTo
		},
		auditPagination: {
			page: Math.min(auditPage, auditTotalPages),
			pageSize: auditPageSize,
			total: auditTotal,
			totalPages: auditTotalPages,
			hasPrev: auditPage > 1,
			hasNext: auditPage < auditTotalPages
		},
		users: usersResult.response.ok ? (usersResult.body?.data?.users ?? []) : [],
		total: userTotal,
		brandingSettings: brandingResult.response.ok ? (brandingResult.body?.data ?? null) : null,
		authSettingsData: authSettingsResult.response.ok
			? (authSettingsResult.body?.data ?? null)
			: null,
		alertSettingsData: alertSettingsResult.response.ok
			? (alertSettingsResult.body?.data ?? null)
			: null,
		maintenanceData: maintenanceResult.response.ok ? (maintenanceResult.body?.data ?? null) : null,
		auditLogsData: auditLogsResult.response.ok ? (auditLogsResult.body?.data ?? null) : null,
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
				: (maintenanceResult.body?.error?.message ?? 'Unable to load maintenance status.'),
			auditLogs: auditLogsResult.response.ok
				? ''
				: (auditLogsResult.body?.error?.message ?? 'Unable to load audit logs.')
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
