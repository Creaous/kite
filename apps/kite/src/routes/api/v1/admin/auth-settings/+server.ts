import { json } from '@sveltejs/kit';

import { isAnonymousEnabled, isEmailAndPasswordEnabled } from '$lib/server/auth';
import {
	getConfiguredSocialProvidersFromEnv,
	type SupportedSocialProviderId
} from '$lib/server/auth-providers';
import { requireAdminUser } from '$lib/server/http-auth';
import { getAuthSettings, saveAuthSettings } from '$lib/server/services/settings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const { configuredProviderIds } = getConfiguredSocialProvidersFromEnv();

	try {
		const data = await getAuthSettings({
			registrationEnabled: isEmailAndPasswordEnabled,
			anonymousTokensEnabled: isAnonymousEnabled,
			publicApiEnabled: true,
			availableSocialProviders: configuredProviderIds
		});

		return json(
			{
				data: {
					...data,
					availableSocialProviders: configuredProviderIds
				}
			},
			{ status: 200 }
		);
	} catch {
		return json(
			{ error: { code: 'AUTH_SETTINGS_FETCH_FAILED', message: 'Failed to load auth settings' } },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const body = await request.json().catch(() => ({}));
	const { configuredProviderIds } = getConfiguredSocialProvidersFromEnv();

	if (typeof body?.registrationEnabled !== 'boolean') {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'registrationEnabled is required' } },
			{ status: 400 }
		);
	}

	if (typeof body?.anonymousTokensEnabled !== 'boolean') {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'anonymousTokensEnabled is required' } },
			{ status: 400 }
		);
	}

	if (typeof body?.publicApiEnabled !== 'boolean') {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'publicApiEnabled is required' } },
			{ status: 400 }
		);
	}

	if (!Array.isArray(body?.enabledSocialProviders)) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'enabledSocialProviders is required' } },
			{ status: 400 }
		);
	}

	const providerSet = new Set(configuredProviderIds);
	const enabledSocialProviders = body.enabledSocialProviders.filter(
		(provider: unknown): provider is SupportedSocialProviderId =>
			typeof provider === 'string' && providerSet.has(provider as SupportedSocialProviderId)
	);

	try {
		const data = await saveAuthSettings(
			{
				registrationEnabled: body.registrationEnabled,
				anonymousTokensEnabled: body.anonymousTokensEnabled,
				publicApiEnabled: body.publicApiEnabled,
				enabledSocialProviders
			},
			{
				registrationEnabled: isEmailAndPasswordEnabled,
				anonymousTokensEnabled: isAnonymousEnabled,
				publicApiEnabled: true,
				availableSocialProviders: configuredProviderIds
			}
		);

		return json(
			{
				data: {
					...data,
					availableSocialProviders: configuredProviderIds
				}
			},
			{ status: 200 }
		);
	} catch {
		return json(
			{ error: { code: 'AUTH_SETTINGS_SAVE_FAILED', message: 'Failed to save auth settings' } },
			{ status: 500 }
		);
	}
};
