import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { initiateUpload } from '$lib/server/services/upload';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

function getMaxUploadSizeBytes() {
	const value = Number(process.env.MAX_UPLOAD_SIZE_BYTES);
	if (!Number.isFinite(value) || value <= 0) {
		return DEFAULT_MAX_UPLOAD_SIZE_BYTES;
	}

	return Math.floor(value);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const body = await request.json();
		const filename = typeof body?.filename === 'string' ? body.filename : '';
		const relativePath = typeof body?.relativePath === 'string' ? body.relativePath : null;
		const size = Number(body?.size);
		const fingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint : '';
		const highSensitivity = Boolean(body?.highSensitivity);
		const maxUploadSizeBytes = getMaxUploadSizeBytes();

		if (!filename || !Number.isFinite(size) || size <= 0 || !fingerprint) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'filename, size, fingerprint are required' } },
				{ status: 400 }
			);
		}

		if (size > maxUploadSizeBytes) {
			return json(
				{
					error: {
						code: 'UPLOAD_TOO_LARGE',
						message: `Upload size exceeds configured limit (${maxUploadSizeBytes} bytes)`
					}
				},
				{ status: 413 }
			);
		}

		const data = await initiateUpload({
			filename,
			relativePath,
			size,
			fingerprint,
			highSensitivity,
			chunkSize: body?.chunkSize ? Number(body.chunkSize) : undefined,
			uploadedBy: locals.user?.id ?? null,
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
