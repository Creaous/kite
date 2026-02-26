import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { generateToken } from '$lib/server/services/token';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

/**
 * @openapi
 * /api/v1/tokens:
 *   post:
 *     tags:
 *       - Tokens
 *     summary: Create a signed token
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - expiresInSec
 *             properties:
 *               subject:
 *                 type: string
 *               purpose:
 *                 type: string
 *                 default: download
 *               expiresInSec:
 *                 type: number
 *                 minimum: 1
 *     responses:
 *       '201':
 *         description: Token created
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Failed to create token
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const body = await request.json();
		const subject = typeof body?.subject === 'string' ? body.subject : '';
		const purpose = typeof body?.purpose === 'string' ? body.purpose : 'download';
		const expiresInSec = Number(body?.expiresInSec ?? 900);

		if (!subject || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'subject and expiresInSec are required' } },
				{ status: 400 }
			);
		}

		const { jwt, dbRecord } = await generateToken({ sub: subject, purpose }, subject, {
			purpose,
			expiration: `${expiresInSec}s`
		});

		const record = Array.isArray(dbRecord) ? dbRecord[0] : dbRecord;
		return json(
			{
				data: {
					token: jwt,
					expiresAt: record?.expiresAt ?? null
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		void err;
		return json(
			{ error: { code: 'TOKEN_CREATE_FAILED', message: 'Failed to create token' } },
			{ status: 500 }
		);
	}
};
