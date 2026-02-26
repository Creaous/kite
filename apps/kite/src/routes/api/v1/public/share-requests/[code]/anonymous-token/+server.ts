import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getShareRequestByCode } from '$lib/server/services/shareRequest';
import { encodeToken, generateLimitedAnonymousToken } from '$lib/server/services/token';
import { includesInternalError } from '$lib/server/api-errors';
import { getConfiguredSocialProvidersFromEnv } from '$lib/server/auth-providers';
import { getAuthSettings } from '$lib/server/services/settings';

/**
 * @openapi
 * /api/v1/public/share-requests/{code}/anonymous-token:
 *   post:
 *     tags:
 *       - PublicShareRequests
 *     summary: Create a limited anonymous token for a share request
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '201':
 *         description: Anonymous token created
 *       '400':
 *         description: Invalid input
 *       '403':
 *         description: Anonymous access disabled
 *       '404':
 *         description: Share request not found
 *       '429':
 *         description: Anonymous token limit reached
 *       '500':
 *         description: Failed to create anonymous token
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const { configuredProviderIds } = getConfiguredSocialProvidersFromEnv();
	const authSettings = await getAuthSettings({
		registrationEnabled: process.env.ALLOW_EMAIL_AND_PASSWORD !== 'false',
		anonymousTokensEnabled: process.env.ALLOW_ANONYMOUS_USERS === 'true',
		availableSocialProviders: configuredProviderIds
	});

	if (!authSettings.anonymousTokensEnabled) {
		return json(
			{ error: { code: 'ANONYMOUS_DISABLED', message: 'Anonymous access is disabled' } },
			{ status: 403 }
		);
	}

	const code = params.code;
	if (!code) {
		return json({ error: { code: 'INVALID_INPUT', message: 'code is required' } }, { status: 400 });
	}

	try {
		const requestData = await getShareRequestByCode(code);
		if (!requestData || requestData.status !== 'open') {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Share request not found' } },
				{ status: 404 }
			);
		}

		const userAgent = request.headers.get('user-agent') ?? undefined;
		const ipAddress = getClientAddress();
		const { jwt, dbRecord } = await generateLimitedAnonymousToken({
			shareRequestCode: code,
			userAgent,
			ipAddress
		});

		const record = Array.isArray(dbRecord) ? dbRecord[0] : dbRecord;
		return json(
			{
				data: {
					token: encodeToken(jwt),
					expiresAt: record?.expiresAt ?? null
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		if (includesInternalError(err, 'ANONYMOUS_TOKEN_LIMIT_REACHED')) {
			return json(
				{
					error: {
						code: 'ANONYMOUS_TOKEN_LIMIT_REACHED',
						message: 'Too many pending anonymous tokens. Please retry shortly.'
					}
				},
				{ status: 429 }
			);
		}

		return json(
			{
				error: {
					code: 'ANONYMOUS_TOKEN_CREATE_FAILED',
					message: 'Failed to create anonymous token'
				}
			},
			{ status: 500 }
		);
	}
};
