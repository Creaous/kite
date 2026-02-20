import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createShare, listShares } from '$lib/server/services/share';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

/**
 * @openapi
 * /api/v1/shares:
 *   get:
 *     tags:
 *       - Shares
 *     summary: List shares
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Shares fetched
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Failed to fetch shares
 */
export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const data = await listShares();
		return json({ data }, { status: 200 });
	} catch (err) {
		void err;
		return json(
			{ error: { code: 'SHARES_FETCH_FAILED', message: 'Failed to fetch shares' } },
			{ status: 500 }
		);
	}
};

/**
 * @openapi
 * /api/v1/shares:
 *   post:
 *     tags:
 *       - Shares
 *     summary: Create a share
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uploads
 *             properties:
 *               title:
 *                 type: string
 *                 nullable: true
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               password:
 *                 type: string
 *                 nullable: true
 *               message:
 *                 type: string
 *                 nullable: true
 *               hideMessageBehindPassword:
 *                 type: boolean
 *               maxDownloads:
 *                 type: number
 *               createdBy:
 *                 type: string
 *                 nullable: true
 *               uploads:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   additionalProperties: true
 *     responses:
 *       '201':
 *         description: Share created
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Failed to create share
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const body = await request.json();
		const uploads = Array.isArray(body?.uploads) ? body.uploads : [];

		if (uploads.length === 0) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'uploads must contain at least one item' } },
				{ status: 400 }
			);
		}

		const data = await createShare({
			title: typeof body?.title === 'string' ? body.title : null,
			expiresAt: body?.expiresAt ? String(body.expiresAt) : null,
			password: typeof body?.password === 'string' ? body.password : null,
			message: typeof body?.message === 'string' ? body.message : null,
			hideMessageBehindPassword: Boolean(body?.hideMessageBehindPassword),
			maxDownloads: typeof body?.maxDownloads === 'number' ? body.maxDownloads : 0,
			uploads,
			createdBy: typeof body?.createdBy === 'string' ? body.createdBy : null
		});

		return json({ data }, { status: 201 });
	} catch (err) {
		const status = includesInternalError(err, 'invalid share payload') ? 400 : 500;
		return json(
			{ error: { code: 'SHARE_CREATE_FAILED', message: 'Failed to create share' } },
			{ status }
		);
	}
};
