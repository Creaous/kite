import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { respondToRequest } from '$lib/server/services/shareRequest';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser, unauthorizedResponse } from '$lib/server/http-auth';

/**
 * @openapi
 * /api/v1/public/share-requests/{code}/respond:
 *   post:
 *     tags:
 *       - PublicShareRequests
 *     summary: Respond to a share request with uploads
 *     security:
 *       - bearerAuth: []
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
 *               - uploads
 *             properties:
 *               uploads:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   additionalProperties: true
 *     responses:
 *       '200':
 *         description: Share request response accepted
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share request not found or not open
 *       '500':
 *         description: Failed to respond to share request
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const allowAnonymousUsers = process.env.ALLOW_ANONYMOUS_USERS === 'true';
	if (locals.user?.isAnonymous && !allowAnonymousUsers) {
		return unauthorizedResponse('Anonymous access is disabled');
	}

	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	try {
		const body = await request.json();
		const uploads = Array.isArray(body?.uploads) ? body.uploads : [];
		if (uploads.length === 0) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'uploads must contain at least one item' } },
				{ status: 400 }
			);
		}

		const data = await respondToRequest(code, uploads);
		return json({ data }, { status: 200 });
	} catch (err) {
		const status =
			includesInternalError(err, 'not found') || includesInternalError(err, 'not open')
				? 404
				: includesInternalError(err, 'no uploads provided')
					? 400
					: 500;
		return json(
			{
				error: {
					code: 'SHARE_REQUEST_RESPOND_FAILED',
					message: 'Failed to respond to share request'
				}
			},
			{ status }
		);
	}
};
