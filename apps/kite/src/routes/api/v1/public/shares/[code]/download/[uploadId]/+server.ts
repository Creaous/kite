import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createShareUploadDownload } from '$lib/server/services/share';
import { includesInternalError } from '$lib/server/api-errors';

export const POST: RequestHandler = async ({ params, request }) => {
	const code = params.code;
	const uploadId = params.uploadId;
	if (!code || !uploadId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'code and uploadId are required' } },
			{ status: 400 }
		);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const password = typeof body?.password === 'string' ? body.password : null;
		const file = await createShareUploadDownload(code, uploadId, password);

		return new Response(file.content.buffer, {
			status: 200,
			headers: {
				'content-type': file.mimeType,
				'content-disposition': `attachment; filename="${file.filename}"`,
				'content-length': String(file.content.byteLength)
			}
		});
	} catch (err) {
		const status =
			includesInternalError(err, 'password') || includesInternalError(err, 'invalid password')
				? 401
				: includesInternalError(err, 'limit')
					? 403
					: includesInternalError(err, 'not found') ||
						  includesInternalError(err, 'expired') ||
						  includesInternalError(err, 'unavailable')
						? 404
						: 500;

		return json(
			{
				error: {
					code: 'PUBLIC_SHARE_FILE_DOWNLOAD_FAILED',
					message: 'Failed to download file'
				}
			},
			{ status }
		);
	}
};
