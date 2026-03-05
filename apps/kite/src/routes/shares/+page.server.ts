import type { Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function toIsoDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

export const load: PageServerLoad = async (event) => {
	const response = await event.fetch('/api/v1/shares');
	const body = await response.json();
	if (!response.ok) {
		const errorMessage = body?.error?.message;
		return { errorMessage, shares: [] };
	}
	return { shares: body.data };
};

export const actions = {
	edit: async (event) => {
		const data = await event.request.formData();

		const id = data.get('id');
		const title = data.get('title') ?? undefined;
		const message = data.get('message') ?? undefined;
		const hideMessageBehindPassword = data.get('hideMessageBehindPassword') ?? undefined;
		const maxDownloads = data.get('maxDownloads') ?? undefined;
		const expiresAt = data.get('expiresAt') ?? undefined;
		const password = data.get('password') ?? undefined;

		const response = await event.fetch(`/api/v1/shares/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title,
				message,
				hideMessageBehindPassword,
				maxDownloads,
				expiresAt: expiresAt ? toIsoDateTime(expiresAt.toString()) : undefined,
				password
			})
		});

		const body = await response.json();
		if (!response.ok) {
			const errorMessage = body?.error?.message;
			return { errorMessage, success: false };
		}

		return { success: true, data: body.data };
	},
	delete: async (event) => {
		const data = await event.request.formData();
		const id = data.get('id');

		const response = await event.fetch(`/api/v1/shares/${id}`, { method: 'DELETE' });
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			const errorMessage = body?.error?.message;
			return { errorMessage, success: false };
		}

		return { success: true };
	}
} satisfies Actions;
