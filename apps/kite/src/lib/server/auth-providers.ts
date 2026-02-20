import type { SocialProviders } from 'better-auth';

export const SUPPORTED_SOCIAL_PROVIDER_IDS = [
	'apple',
	'discord',
	'facebook',
	'github',
	'gitlab',
	'google',
	'microsoft'
] as const;

export type SupportedSocialProviderId = (typeof SUPPORTED_SOCIAL_PROVIDER_IDS)[number];

export function getConfiguredSocialProvidersFromEnv(): {
	providers: SocialProviders;
	configuredProviderIds: SupportedSocialProviderId[];
} {
	const configuredProviderIds: SupportedSocialProviderId[] = [];
	const providers: SocialProviders = {};

	for (const providerId of SUPPORTED_SOCIAL_PROVIDER_IDS) {
		const envPrefix = providerId.toUpperCase();
		const clientId = process.env[`${envPrefix}_CLIENT_ID`];
		const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];

		if (!clientId || !clientSecret) {
			continue;
		}

		configuredProviderIds.push(providerId);

		const baseConfig = {
			clientId,
			clientSecret,
			disableImplicitSignUp: true
		};

		if (providerId === 'microsoft') {
			providers.microsoft = {
				...baseConfig,
				tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
				prompt: 'select_account'
			};
			continue;
		}

		providers[providerId] = baseConfig;
	}

	return {
		providers,
		configuredProviderIds
	};
}
