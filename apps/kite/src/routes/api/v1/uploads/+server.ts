import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { initiateUpload } from '$lib/server/services/upload';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

export const POST: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const body = await request.json();
		const filename = typeof body?.filename === 'string' ? body.filename : '';
		const relativePath = typeof body?.relativePath === 'string' ? body.relativePath : null;
		const size = Number(body?.size);
		const fingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint : '';

		if (!filename || !Number.isFinite(size) || size <= 0 || !fingerprint) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'filename, size, fingerprint are required' } },
				{ status: 400 }
			);
		}

		const data = await initiateUpload({
			filename,
			relativePath,
			size,
			fingerprint,
			chunkSize: body?.chunkSize ? Number(body.chunkSize) : undefined,
			uploadedBy: typeof body?.uploadedBy === 'string' ? body.uploadedBy : null,
			shareId: typeof body?.shareId === 'string' ? body.shareId : null,
			shareRequestId: typeof body?.shareRequestId === 'string' ? body.shareRequestId : null
		});

		return json({ data }, { status: 201 });
	} catch (err) {
		void err;
		return json(
			{ error: { code: 'UPLOAD_CREATE_FAILED', message: 'Unable to create upload' } },
			{ status: 500 }
		);
	}
};
