import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createShareDownloadGrant } from '$lib/server/services/share';
import { includesInternalError } from '$lib/server/api-errors';

/**
 * @openapi
 * /api/v1/public/shares/{code}/download:
 *   post:
 *     tags:
 *       - PublicShares
 *     summary: Create a download token for a public share
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
 *         description: Download token created
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Invalid password
 *       '403':
 *         description: Download limit reached
 *       '404':
 *         description: Share not found or expired
 *       '500':
 *         description: Failed to issue download token
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const password = typeof body?.password === 'string' ? body.password : null;
		const data = await createShareDownloadGrant(code, password);
		return json({ data }, { status: 200 });
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
				error: { code: 'PUBLIC_SHARE_DOWNLOAD_FAILED', message: 'Failed to issue download token' }
			},
			{ status }
		);
	}
};
