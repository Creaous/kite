import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { forbiddenResponse, requireAuthenticatedUser } from '$lib/server/http-auth';
import { getShareRequestById } from '$lib/server/services/shareRequest';
import {
	isShareRequestEmailConfigured,
	sendShareRequestEmail
} from '$lib/server/services/shareRequestEmail';

function isValidEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeRecipients(input: unknown) {
	if (!Array.isArray(input)) return null;

	const deduped = new Map<string, { name?: string; email: string }>();

	for (const value of input) {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const recipient = value as { name?: unknown; email?: unknown };
		if (typeof recipient.email !== 'string') return null;

		const email = recipient.email.trim().toLowerCase();
		if (!email || !isValidEmail(email)) return null;

		const name = typeof recipient.name === 'string' ? recipient.name.trim() : '';

		if (!deduped.has(email)) {
			deduped.set(email, name ? { name, email } : { email });
		}
	}

	const recipients = Array.from(deduped.values());
	if (recipients.length === 0) return null;

	return recipients;
}

/**
 * @openapi
 * /api/v1/share-requests/{requestId}/email:
 *   post:
 *     tags:
 *       - ShareRequests
 *     summary: Email a share request link
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
 *             required:
 *               - recipients
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - email
 *                   properties:
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *     responses:
 *       '202':
 *         description: Email queued
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Share request not found
 *       '503':
 *         description: SMTP is not configured
 */
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
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

	const requestId = params.requestId;
	if (!requestId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'requestId is required' } },
			{ status: 400 }
		);
	}

	if (!isShareRequestEmailConfigured()) {
		return json(
			{ error: { code: 'SMTP_NOT_CONFIGURED', message: 'SMTP is not configured' } },
			{ status: 503 }
		);
	}

	try {
		const body = await request.json();
		const recipients = normalizeRecipients(body?.recipients);
		if (!recipients) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'recipients must be a list of objects with optional name and valid email'
					}
				},
				{ status: 400 }
			);
		}

		const shareRequest = await getShareRequestById(requestId);
		if (!shareRequest) {
			return json(
				{ error: { code: 'SHARE_REQUEST_NOT_FOUND', message: 'Share request not found' } },
				{ status: 404 }
			);
		}
		if (!shareRequest.code) {
			return json(
				{ error: { code: 'SHARE_REQUEST_EMAIL_FAILED', message: 'Failed to email share request' } },
				{ status: 500 }
			);
		}

		const requestUrl = new URL(`/r/${shareRequest.code}`, url.origin).toString();
		const payload = {
			recipients,
			requestUrl,
			shareRequest: {
				code: shareRequest.code,
				title: shareRequest.title,
				message: shareRequest.message,
				requesterName: shareRequest.requesterName,
				requesterEmail: shareRequest.hideRequesterEmail ? null : shareRequest.requesterEmail
			}
		};

		void sendShareRequestEmail(payload).catch(() => undefined);

		return json(
			{
				data: {
					recipients,
					accepted: recipients.map((recipient) => recipient.email),
					rejected: []
				}
			},
			{ status: 202 }
		);
	} catch {
		return json(
			{ error: { code: 'SHARE_REQUEST_EMAIL_FAILED', message: 'Failed to email share request' } },
			{ status: 500 }
		);
	}
};
