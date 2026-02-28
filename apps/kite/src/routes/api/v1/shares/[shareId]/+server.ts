import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { includesInternalError } from '$lib/server/api-errors';
import { forbiddenResponse, requireAuthenticatedUser } from '$lib/server/http-auth';
import { getShare, softDeleteShare, updateShare } from '$lib/server/services/share';

/**
 * @openapi
 * /api/v1/shares/{shareId}:
 *   get:
 *     tags:
 *       - Shares
 *     summary: Get share by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Share found
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share not found
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { shareId } = params;
	if (!shareId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'shareId is required' } },
			{ status: 400 }
		);
	}

	const data = await getShare(shareId);
	if (!data) {
		return json({ error: { code: 'NOT_FOUND', message: 'Share not found' } }, { status: 404 });
	}

	const isAdmin = locals.user?.role === 'admin';
	if (!isAdmin && data.createdBy !== locals.user?.id) {
		return forbiddenResponse('You do not have permission to access this share');
	}

	return json({ data }, { status: 200 });
};

/**
 * @openapi
 * /api/v1/shares/{shareId}:
 *   delete:
 *     tags:
 *       - Shares
 *     summary: Delete share by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '204':
 *         description: Share deleted
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share not found
 *       '500':
 *         description: Failed to delete share
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { shareId } = params;
	if (!shareId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'shareId is required' } },
			{ status: 400 }
		);
	}

	try {
		const existing = await getShare(shareId);

		const isAdmin = locals.user?.role === 'admin';
		if (existing && !isAdmin && existing.createdBy !== locals.user?.id) {
			return forbiddenResponse('You do not have permission to delete this share');
		}

		await softDeleteShare(shareId);
		return new Response(null, { status: 204 });
	} catch (err) {
		const status = includesInternalError(err, 'not found') ? 404 : 500;
		return json(
			{ error: { code: 'SHARE_DELETE_FAILED', message: 'Failed to delete share' } },
			{ status }
		);
	}
};

/**
 * @openapi
 * /api/v1/shares/{shareId}:
 *   patch:
 *     tags:
 *       - Shares
 *     summary: Update share by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
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
 *               hideMessageBehindPassword:
 *                 type: boolean
 *               maxDownloads:
 *                 type: number
 *                 nullable: true
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               password:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Share updated
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Share not found
 *       '500':
 *         description: Failed to update share
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { shareId } = params;
	if (!shareId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'shareId is required' } },
			{ status: 400 }
		);
	}

	try {
		const existing = await getShare(shareId);
		if (!existing) {
			return json({ error: { code: 'NOT_FOUND', message: 'Share not found' } }, { status: 404 });
		}

		const isAdmin = locals.user?.role === 'admin';
		if (!isAdmin && existing.createdBy !== locals.user?.id) {
			return forbiddenResponse('You do not have permission to update this share');
		}

		const body = await request.json();
		const data = await updateShare(shareId, {
			title: typeof body?.title === 'string' ? body.title : body?.title === null ? null : undefined,
			message:
				typeof body?.message === 'string'
					? body.message
					: body?.message === null
						? null
						: undefined,
			hideMessageBehindPassword:
				typeof body?.hideMessageBehindPassword === 'boolean'
					? body.hideMessageBehindPassword
					: undefined,
			maxDownloads:
				typeof body?.maxDownloads === 'number'
					? body.maxDownloads
					: body?.maxDownloads === null
						? 0
						: undefined,
			expiresAt:
				body?.expiresAt !== undefined
					? body.expiresAt
						? String(body.expiresAt)
						: null
					: undefined,
			password:
				typeof body?.password === 'string'
					? body.password
					: body?.password === null
						? null
						: undefined
		});

		return json({ data }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'not found') ? 404 : 500;
		return json(
			{ error: { code: 'SHARE_UPDATE_FAILED', message: 'Failed to update share' } },
			{ status }
		);
	}
};
