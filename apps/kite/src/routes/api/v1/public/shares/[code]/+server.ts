import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicShareByCode } from '$lib/server/services/share';
import { includesInternalError } from '$lib/server/api-errors';

/**
 * @openapi
 * /api/v1/public/shares/{code}:
 *   get:
 *     tags:
 *       - PublicShares
 *     summary: Get public share details
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Public share fetched
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Invalid password
 *       '404':
 *         description: Share not found or expired
 *       '500':
 *         description: Failed to fetch share
 */
export const GET: RequestHandler = async ({ params }) => {
	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	try {
		const data = await getPublicShareByCode(code);
		return json({ data }, { status: 200 });
	} catch (err) {
		const status =
			includesInternalError(err, 'not found') || includesInternalError(err, 'expired') ? 404 : 500;

		const error =
			includesInternalError(err, 'not found') || includesInternalError(err, 'expired')
				? { code: 'PUBLIC_SHARE_NOT_FOUND_OR_EXPIRED', message: 'Share not found or expired' }
				: { code: 'PUBLIC_SHARE_FETCH_FAILED', message: 'Failed to fetch share' };

		return json({ error }, { status });
	}
};

/**
 * @openapi
 * /api/v1/public/shares/{code}:
 *   post:
 *     tags:
 *       - PublicShares
 *     summary: Unlock and get public share details
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Public share fetched
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Invalid password
 *       '404':
 *         description: Share not found or expired
 *       '500':
 *         description: Failed to fetch share
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const password = typeof body?.password === 'string' ? body.password : '';
	if (!password) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'password is required' } },
			{ status: 400 }
		);
	}

	try {
		const data = await getPublicShareByCode(code, password);
		return json({ data }, { status: 200 });
	} catch (err) {
		const status =
			includesInternalError(err, 'not found') || includesInternalError(err, 'expired')
				? 404
				: includesInternalError(err, 'password')
					? 401
					: 500;

		const error =
			includesInternalError(err, 'not found') || includesInternalError(err, 'expired')
				? { code: 'PUBLIC_SHARE_NOT_FOUND_OR_EXPIRED', message: 'Share not found or expired' }
				: includesInternalError(err, 'password')
					? { code: 'INVALID_PASSWORD', message: 'Invalid password' }
					: { code: 'PUBLIC_SHARE_FETCH_FAILED', message: 'Failed to fetch share' };

		return json({ error }, { status });
	}
};
