import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createShareRequest, listShareRequests } from '$lib/server/services/shareRequest';
import { forbiddenResponse, requireAuthenticatedUser } from '$lib/server/http-auth';
import { auth } from '$lib/server/auth';

/**
 * @openapi
 * /api/v1/share-requests:
 *   get:
 *     tags:
 *       - ShareRequests
 *     summary: List share requests
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Share requests fetched
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Failed to fetch share requests
 */
export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const data = await listShareRequests();
		return json({ data }, { status: 200 });
	} catch (err) {
		void err;
		return json(
			{ error: { code: 'SHARE_REQUESTS_FETCH_FAILED', message: 'Failed to fetch share requests' } },
			{ status: 500 }
		);
	}
};

/**
 * @openapi
 * /api/v1/share-requests:
 *   post:
 *     tags:
 *       - ShareRequests
 *     summary: Create a share request
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *                 nullable: true
 *               requester:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *               hideRequesterEmail:
 *                 type: boolean
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               createdBy:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '201':
 *         description: Share request created
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Failed to create share request
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	let hasCreatePermission;
	try {
		const permissionResult = await auth.api.userHasPermission({
			body: {
				userId: locals.user?.id,
				permissions: {
					shareRequest: ['create']
				}
			}
		});
		hasCreatePermission = permissionResult.success;
	} catch {
		hasCreatePermission = false;
	}

	if (!hasCreatePermission) {
		return forbiddenResponse('Missing permission: shareRequests.create');
	}

	try {
		const body = await request.json();
		if (typeof body?.title !== 'string' || !body.title.trim()) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'title is required' } },
				{ status: 400 }
			);
		}

		const data = await createShareRequest({
			title: body.title,
			message: typeof body?.message === 'string' ? body.message : null,
			requester:
				body?.requester && typeof body.requester === 'object'
					? {
							name: typeof body.requester.name === 'string' ? body.requester.name : undefined,
							email: typeof body.requester.email === 'string' ? body.requester.email : undefined
						}
					: null,
			hideRequesterEmail: body?.hideRequesterEmail === true,
			expiresAt: body?.expiresAt ? String(body.expiresAt) : null,
			createdBy: typeof body?.createdBy === 'string' ? body.createdBy : null
		});

		return json({ data }, { status: 201 });
	} catch (err) {
		void err;
		return json(
			{ error: { code: 'SHARE_REQUEST_CREATE_FAILED', message: 'Failed to create share request' } },
			{ status: 500 }
		);
	}
};
