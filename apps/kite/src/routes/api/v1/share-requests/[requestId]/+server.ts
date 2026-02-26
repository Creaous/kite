import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { softDeleteShareRequest, updateShareRequest } from '$lib/server/services/shareRequest';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

/**
 * @openapi
 * /api/v1/share-requests/{requestId}:
 *   patch:
 *     tags:
 *       - ShareRequests
 *     summary: Update a share request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 nullable: true
 *               message:
 *                 type: string
 *                 nullable: true
 *               requester:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   name:
 *                     type: string
 *                     nullable: true
 *                   email:
 *                     type: string
 *                     nullable: true
 *               hideRequesterEmail:
 *                 type: boolean
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [open, fulfilled, expired, deleted]
 *     responses:
 *       '200':
 *         description: Share request updated
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share request not found
 *       '500':
 *         description: Failed to update share request
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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
		const body = await request.json();
		const data = await updateShareRequest(requestId, {
			title: typeof body?.title === 'string' ? body.title : body?.title === null ? null : undefined,
			message:
				typeof body?.message === 'string'
					? body.message
					: body?.message === null
						? null
						: undefined,
			requester:
				body?.requester && typeof body.requester === 'object'
					? {
							name:
								typeof body.requester.name === 'string'
									? body.requester.name
									: body.requester.name === null
										? null
										: undefined,
							email:
								typeof body.requester.email === 'string'
									? body.requester.email
									: body.requester.email === null
										? null
										: undefined
						}
					: body?.requester === null
						? null
						: undefined,
			hideRequesterEmail:
				typeof body?.hideRequesterEmail === 'boolean' ? body.hideRequesterEmail : undefined,
			expiresAt:
				body?.expiresAt !== undefined
					? body.expiresAt
						? String(body.expiresAt)
						: null
					: undefined,
			status:
				typeof body?.status === 'string' &&
				['open', 'fulfilled', 'expired', 'deleted'].includes(body.status)
					? body.status
					: undefined
		});

		return json({ data }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'not found') ? 404 : 500;
		return json(
			{ error: { code: 'SHARE_REQUEST_UPDATE_FAILED', message: 'Failed to update share request' } },
			{ status }
		);
	}
};

/**
 * @openapi
 * /api/v1/share-requests/{requestId}:
 *   delete:
 *     tags:
 *       - ShareRequests
 *     summary: Delete a share request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '204':
 *         description: Share request deleted
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share request not found
 *       '500':
 *         description: Failed to delete share request
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
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
		await softDeleteShareRequest(requestId);
		return new Response(null, { status: 204 });
	} catch (err) {
		const status = includesInternalError(err, 'not found') ? 404 : 500;
		return json(
			{ error: { code: 'SHARE_REQUEST_DELETE_FAILED', message: 'Failed to delete share request' } },
			{ status }
		);
	}
};
