import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type PublicShare = {
	id: string;
	code: string;
	title: string | null;
	message: string | null;
	hideMessageBehindPassword: boolean;
	expiresAt: string | null;
	maxDownloads: number;
	downloadCount: number;
	viewCount: number;
	requiresPassword: boolean;
	uploads: { id: string; filename: string | null; relativePath: string | null; size: number }[];
};

async function fetchShare(event: Parameters<PageServerLoad>[0], password?: string) {
	const response = password
		? await event.fetch(`/api/v1/public/shares/${event.params.code}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			})
		: await event.fetch(`/api/v1/public/shares/${event.params.code}`);

	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		return {
			success: false as const,
			status: response.status,
			errorMessage: body?.error?.message ?? 'Unable to load share.',
			errorCode: body?.error?.code ?? null
		};
	}

	return {
		success: true as const,
		data: body.data as PublicShare
	};
}

export const load: PageServerLoad = async (event) => {
	const result = await fetchShare(event);
	if (!result.success) {
		return {
			share: null,
			errorMessage: result.errorMessage,
			requiresPassword: result.status === 401,
			notFound: result.status === 404
		};
	}

	return {
		share: result.data,
		errorMessage: '',
		requiresPassword: false,
		notFound: false
	};
};

export const actions = {
	unlock: async (event) => {
		const data = await event.request.formData();
		const password = data.get('password');
		if (typeof password !== 'string' || !password.trim()) {
			return fail(400, { errorMessage: 'Password is required.' });
		}

		const result = await fetchShare(event as Parameters<PageServerLoad>[0], password);
		if (!result.success) {
			return fail(result.status, {
				errorMessage: result.errorMessage,
				requiresPassword: true
			});
		}

		return {
			success: true,
			data: result.data,
			password
		};
	}
} satisfies Actions;
