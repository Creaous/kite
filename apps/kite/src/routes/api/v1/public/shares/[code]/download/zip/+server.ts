import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createShareZipDownload } from '$lib/server/services/share';
import { includesInternalError } from '$lib/server/api-errors';

/**
 * @openapi
 * /api/v1/public/shares/{code}/download/zip:
 *   post:
 *     tags:
 *       - PublicShares
 *     summary: Download public share files as zip
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Zip archive stream
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Invalid password
 *       '403':
 *         description: Download limit reached
 *       '404':
 *         description: Share not found or expired
 *       '500':
 *         description: Failed to create zip download
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const password = typeof body?.password === 'string' ? body.password : null;
		const zip = await createShareZipDownload(code, password);
		const zipBytes = Uint8Array.from(zip.content);

		return new Response(zipBytes.buffer, {
			status: 200,
			headers: {
				'content-type': 'application/zip',
				'content-disposition': `attachment; filename="${zip.filename}"`,
				'content-length': String(zipBytes.byteLength)
			}
		});
	} catch (err) {
		const status =
			includesInternalError(err, 'password') || includesInternalError(err, 'invalid password')
				? 401
				: includesInternalError(err, 'limit')
					? 403
					: includesInternalError(err, 'not found') || includesInternalError(err, 'expired')
						? 404
						: 500;
		return json(
			{
				error: {
					code: 'PUBLIC_SHARE_ZIP_DOWNLOAD_FAILED',
					message: 'Failed to create zip download'
				}
			},
			{ status }
		);
	}
};
