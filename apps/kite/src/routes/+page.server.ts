import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const title = data.get('title');
		const password = data.get('password');
		const expiresAt = data.get('expiresAt');
		const message = data.get('message');
		const hideMessageBehindPassword = data.get('hideMessageBehindPassword') === 'on';
		const highSensitivity = data.get('highSensitivity') === 'on';
		const maxDownloads = data.get('maxDownloads');
		const uploadsRaw = data.get('uploads');

		if (typeof uploadsRaw !== 'string' || !uploadsRaw.trim()) {
			return fail(400, { errorMessage: 'At least one file is required.' });
		}

		let uploads: { uploadId: string; name: string }[];
		try {
			uploads = JSON.parse(uploadsRaw) as { uploadId: string; name: string }[];
		} catch {
			return fail(400, { errorMessage: 'Invalid upload payload.' });
		}

		if (!Array.isArray(uploads) || uploads.length === 0) {
			return fail(400, { errorMessage: 'At least one file is required.' });
		}

		const response = await event.fetch('/api/v1/shares', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: typeof title === 'string' && title.trim() ? title : undefined,
				password: typeof password === 'string' && password.trim() ? password : undefined,
				message: typeof message === 'string' && message.trim() ? message : undefined,
				hideMessageBehindPassword,
				highSensitivity,
				maxDownloads: typeof maxDownloads === 'string' ? Number(maxDownloads) || 0 : 0,
				expiresAt: typeof expiresAt === 'string' && expiresAt.trim() ? expiresAt : undefined,
				uploads
			})
		});

		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			return fail(response.status, {
				errorMessage: body?.error?.message ?? 'Unable to create share.'
			});
		}

		return {
			success: true,
			data: body.data
		};
	}
} satisfies Actions;
