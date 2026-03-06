import type { PageServerLoad, RequestEvent } from './$types';
import { fail, type Actions } from '@sveltejs/kit';
import { isShareRequestEmailConfigured } from '$lib/server/services/shareRequestEmail';
import { auth } from '$lib/server/auth';

function toIsoDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

export const load: PageServerLoad = async (event) => {
	const canCreateShareRequest = await auth.api.userHasPermission({
		body: {
			userId: event.locals.user?.id,
			permissions: {
				shareRequest: ['create']
			}
		}
	});

	const response = await event.fetch('/api/v1/share-requests');
	const body = await response.json();
	if (!response.ok) {
		const errorMessage = body?.error?.message;
		return { errorMessage, shareRequests: [] };
	}
	return {
		smtpConfigured: isShareRequestEmailConfigured(),
		shareRequests: body.data,
		canCreateShareRequest: canCreateShareRequest.success
	};
};

// to-do: fix request event type
// these use nearly the exact same structure, so let's reuse the code
async function createOrEdit(event: RequestEvent, create: boolean) {
	const data = await event.request.formData();

	const id = data.get('id');
	const title = data.get('title') ?? undefined;
	const message = data.get('message') ?? undefined;
	const requesterName = data.get('requesterName') ?? undefined;
	const requesterEmail = data.get('requesterEmail') ?? undefined;
	// this sucks, why is this "on" instead of true?
	// who was the genius behind deciding this?
	const hideRequesterEmail = data.get('hideRequesterEmail') === 'on';
	const password = data.get('password') ?? undefined;
	const clearPassword = data.get('clearPassword') === 'on';
	const maxSubmissions = data.get('maxSubmissions') ?? undefined;
	const expiresAt = data.get('expiresAt') ?? undefined;

	if (!create && !id) return fail(400);

	const response = await event.fetch(
		create ? '/api/v1/share-requests' : '/api/v1/share-requests/' + id,
		{
			method: create ? 'POST' : 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title,
				message,
				requester: {
					name: requesterName,
					email: requesterEmail
				},
				hideRequesterEmail,
				password: typeof password === 'string' && password.trim().length > 0 ? password : undefined,
				clearPassword,
				maxSubmissions: maxSubmissions ? Number(maxSubmissions) : undefined,
				expiresAt: expiresAt ? toIsoDateTime(expiresAt.toString()) : undefined
			})
		}
	);

	const body = await response.json();

	if (!response.ok) {
		const errorMessage = body?.error?.message;
		return { errorMessage, success: false };
	}

	return { success: true, data: body.data };
}

export const actions = {
	create: async (event) => {
		// to-do: fix request event type
		return createOrEdit(event as RequestEvent, true);
	},
	edit: async (event) => {
		// to-do: fix request event type
		return createOrEdit(event as RequestEvent, false);
	},
	delete: async (event) => {
		const data = await event.request.formData();
		const id = data.get('id');

		if (!id) return fail(400);

		const response = await event.fetch(`/api/v1/share-requests/${id}`, { method: 'DELETE' });
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			const errorMessage = body?.error?.message;
			return { errorMessage, success: false };
		}

		return { success: true };
	},
	email: async (event) => {
		const data = await event.request.formData();
		const id = data.get('id');
		const rawRecipients = data.get('recipients');

		if (!id || !rawRecipients) return fail(400);

		const recipients = JSON.parse(rawRecipients?.toString());

		const response = await event.fetch(`/api/v1/share-requests/${id}/email`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ recipients })
		});

		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			const errorMessage = body?.error?.message;
			return { errorMessage, success: false };
		}

		return { success: true };
	}
} satisfies Actions;
