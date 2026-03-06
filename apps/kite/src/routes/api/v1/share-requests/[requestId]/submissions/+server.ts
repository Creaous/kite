import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser } from '$lib/server/http-auth';
import { listShareRequestSubmissions } from '$lib/server/services/shareRequest';

/**
 * @openapi
 * /api/v1/share-requests/{requestId}/submissions:
 *   get:
 *     tags:
 *       - ShareRequests
 *     summary: List submissions for a share request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Request submissions fetched
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share request not found
 *       '500':
 *         description: Failed to fetch submissions
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { requestId } = params;
	if (!requestId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'requestId is required' } },
			{ status: 400 }
		);
	}

	try {
		const data = await listShareRequestSubmissions(requestId);
		return json({ data }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'not found') ? 404 : 500;
		return json(
			{
				error: {
					code: 'SHARE_REQUEST_SUBMISSIONS_FETCH_FAILED',
					message: 'Failed to fetch submissions'
				}
			},
			{ status }
		);
	}
};
