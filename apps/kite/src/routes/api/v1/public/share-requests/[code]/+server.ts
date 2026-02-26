import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getShareRequestByCode } from '$lib/server/services/shareRequest';

/**
 * @openapi
 * /api/v1/public/share-requests/{code}:
 *   get:
 *     tags:
 *       - PublicShareRequests
 *     summary: Get public share request by code
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Share request found
 *       '400':
 *         description: Invalid input
 *       '404':
 *         description: Share request not found
 */
export const GET: RequestHandler = async ({ params }) => {
	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	const data = await getShareRequestByCode(code);
	if (!data) {
		return json(
			{ error: { code: 'NOT_FOUND', message: 'Share request not found' } },
			{ status: 404 }
		);
	}

	const publicData = {
		...data,
		requesterEmail: data.hideRequesterEmail ? null : data.requesterEmail
	};

	return json({ data: publicData }, { status: 200 });
};
