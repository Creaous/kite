import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { finalizeUpload } from '$lib/server/services/upload';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { uploadId } = params;

	if (!uploadId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'uploadId is required' } },
			{ status: 400 }
		);
	}

	try {
		const body = await request.json();
		const action = body?.action;
		if (action !== 'finalize' && action !== 'cancel') {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'action must be finalize or cancel' } },
				{ status: 400 }
			);
		}

		const data = await finalizeUpload(uploadId, action, {
			userId: locals.user!.id,
			isAdmin: locals.user?.role === 'admin'
		});
		return json({ data }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'not found')
			? 404
			: includesInternalError(err, 'forbidden')
				? 403
				: 500;
		return json(
			{ error: { code: 'UPLOAD_STATUS_FAILED', message: 'Failed to update upload status' } },
			{ status }
		);
	}
};
