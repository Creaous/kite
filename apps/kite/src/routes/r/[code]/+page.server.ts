import { auth } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfiguredSocialProvidersFromEnv } from '$lib/server/auth-providers';
import { getAuthSettings } from '$lib/server/services/settings';
import { isAnonymousEnabled, isEmailAndPasswordEnabled } from '$lib/server/auth';

type ShareRequest = {
	id: string;
	code: string;
	title: string | null;
	message: string | null;
	requesterName: string | null;
	requesterEmail: string | null;
	status: string;
	expiresAt: string | null;
};

async function ensureSubmissionSession(
	event: Parameters<PageServerLoad>[0],
	allowAnonymousUsers: boolean
) {
	if (event.locals.user) {
		return true;
	}

	if (!allowAnonymousUsers) {
		return false;
	}

	const tokenResponse = await event.fetch(
		`/api/v1/public/share-requests/${event.params.code}/anonymous-token`,
		{
			method: 'POST'
		}
	);
	const tokenBody = await tokenResponse.json().catch(() => ({}));
	if (!tokenResponse.ok || !tokenBody?.data?.token) {
		return false;
	}

	try {
		await auth.api.signInAnonymous({
			headers: event.request.headers,
			query: {
				token: tokenBody.data.token
			}
		});
		return true;
	} catch {
		return false;
	}
}

async function fetchRequest(event: Parameters<PageServerLoad>[0]) {
	const response = await event.fetch(`/api/v1/public/share-requests/${event.params.code}`);
	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		return {
			success: false as const,
			status: response.status,
			errorMessage: body?.error?.message ?? 'Unable to load request.'
		};
	}

	return {
		success: true as const,
		data: body.data as ShareRequest
	};
}

export const load: PageServerLoad = async (event) => {
	const { authSettings } = await event.parent();
	const allowAnonymousUsers = Boolean(authSettings?.anonymousTokensEnabled);
	const result = await fetchRequest(event);

	if (!result.success) {
		return {
			requestData: null,
			errorMessage: result.errorMessage,
			notFound: result.status === 404,
			allowAnonymousUsers,
			hasSubmissionSession: Boolean(event.locals.user)
		};
	}

	return {
		requestData: result.data,
		errorMessage: '',
		notFound: false,
		allowAnonymousUsers,
		hasSubmissionSession: Boolean(event.locals.user)
	};
};

export const actions = {
	respond: async (event) => {
		const { configuredProviderIds } = getConfiguredSocialProvidersFromEnv();
		const authSettings = await getAuthSettings({
			registrationEnabled: isEmailAndPasswordEnabled,
			anonymousTokensEnabled: isAnonymousEnabled,
			availableSocialProviders: configuredProviderIds
		});
		const allowAnonymousUsers = Boolean(authSettings.anonymousTokensEnabled);
		const data = await event.request.formData();
		const uploadsRaw = data.get('uploads');

		if (typeof uploadsRaw !== 'string' || !uploadsRaw.trim()) {
			return fail(400, { errorMessage: 'At least one upload is required.' });
		}

		let uploads: { uploadId: string }[];
		try {
			uploads = JSON.parse(uploadsRaw) as { uploadId: string }[];
		} catch {
			return fail(400, { errorMessage: 'Invalid upload payload.' });
		}

		if (!Array.isArray(uploads) || uploads.length === 0) {
			return fail(400, { errorMessage: 'At least one upload is required.' });
		}

		const hasSession = await ensureSubmissionSession(
			event as Parameters<PageServerLoad>[0],
			allowAnonymousUsers
		);
		if (!hasSession) {
			return fail(401, { errorMessage: 'Sign in is required to respond to this request.' });
		}

		const response = await event.fetch(
			`/api/v1/public/share-requests/${event.params.code}/respond`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ uploads })
			}
		);
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to submit response.'
			});
		}

		return {
			success: true,
			data: body.data
		};
	}
} satisfies Actions;
