import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import type { SupportedSocialProviderId } from '$lib/server/auth-providers';
import { eq } from 'drizzle-orm';

const BRANDING_KEY = 'branding';
const AUTH_SETTINGS_KEY = 'auth';

export type BrandingSettings = {
	appName: string;
	tagline: string;
	logoUrl: string;
	faviconUrl: string;
	disableIndexing: boolean;
};

export type AuthSettings = {
	registrationEnabled: boolean;
	anonymousTokensEnabled: boolean;
	enabledSocialProviders: SupportedSocialProviderId[];
};

export type AuthSettingsDefaults = {
	registrationEnabled: boolean;
	anonymousTokensEnabled: boolean;
	availableSocialProviders: readonly SupportedSocialProviderId[];
};

const defaultBranding: BrandingSettings = {
	appName: 'Kite',
	tagline: '',
	logoUrl: '',
	faviconUrl: '',
	disableIndexing: true
};

function normalizeAuthSettingsDefaults(
	defaults: Partial<AuthSettingsDefaults>
): AuthSettingsDefaults {
	return {
		registrationEnabled:
			typeof defaults.registrationEnabled === 'boolean' ? defaults.registrationEnabled : true,
		anonymousTokensEnabled:
			typeof defaults.anonymousTokensEnabled === 'boolean'
				? defaults.anonymousTokensEnabled
				: false,
		availableSocialProviders: Array.isArray(defaults.availableSocialProviders)
			? defaults.availableSocialProviders
			: []
	};
}

function getDefaultAuthSettings(defaults: AuthSettingsDefaults): AuthSettings {
	return {
		registrationEnabled: defaults.registrationEnabled,
		anonymousTokensEnabled: defaults.anonymousTokensEnabled,
		enabledSocialProviders: [...defaults.availableSocialProviders]
	};
}

function toBrandingSettings(value: unknown): BrandingSettings {
	if (!value || typeof value !== 'object') {
		return defaultBranding;
	}

	const parsed = value as Partial<BrandingSettings>;

	return {
		appName: typeof parsed.appName === 'string' ? parsed.appName : defaultBranding.appName,
		tagline: typeof parsed.tagline === 'string' ? parsed.tagline : defaultBranding.tagline,
		logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : defaultBranding.logoUrl,
		faviconUrl:
			typeof parsed.faviconUrl === 'string' ? parsed.faviconUrl : defaultBranding.faviconUrl,
		disableIndexing:
			typeof parsed.disableIndexing === 'boolean'
				? parsed.disableIndexing
				: defaultBranding.disableIndexing
	};
}

function toAuthSettings(
	value: unknown,
	defaultsInput: Partial<AuthSettingsDefaults>
): AuthSettings {
	const defaults = normalizeAuthSettingsDefaults(defaultsInput);
	const fallback = getDefaultAuthSettings(defaults);

	if (!value || typeof value !== 'object') {
		return fallback;
	}

	const parsed = value as Partial<AuthSettings>;
	const allowedProviderSet = new Set(defaults.availableSocialProviders);
	const enabledSocialProviders = Array.isArray(parsed.enabledSocialProviders)
		? parsed.enabledSocialProviders.filter(
				(provider): provider is SupportedSocialProviderId =>
					typeof provider === 'string' &&
					allowedProviderSet.has(provider as SupportedSocialProviderId)
			)
		: fallback.enabledSocialProviders;

	return {
		registrationEnabled:
			typeof parsed.registrationEnabled === 'boolean'
				? parsed.registrationEnabled
				: fallback.registrationEnabled,
		anonymousTokensEnabled:
			typeof parsed.anonymousTokensEnabled === 'boolean'
				? parsed.anonymousTokensEnabled
				: fallback.anonymousTokensEnabled,
		enabledSocialProviders
	};
}

export async function getBrandingSettings() {
	const [row] = await db.select().from(settings).where(eq(settings.key, BRANDING_KEY)).limit(1);

	if (!row) {
		return defaultBranding;
	}

	try {
		return toBrandingSettings(JSON.parse(row.value));
	} catch {
		return defaultBranding;
	}
}

export async function saveBrandingSettings(input: Partial<BrandingSettings>) {
	const current = await getBrandingSettings();

	const next: BrandingSettings = {
		appName: input.appName?.trim() || current.appName,
		tagline: input.tagline?.trim() ?? current.tagline,
		logoUrl: input.logoUrl?.trim() ?? current.logoUrl,
		faviconUrl: input.faviconUrl?.trim() ?? current.faviconUrl,
		disableIndexing:
			typeof input.disableIndexing === 'boolean' ? input.disableIndexing : current.disableIndexing
	};

	const serialized = JSON.stringify(next);

	const [existing] = await db
		.select({ key: settings.key })
		.from(settings)
		.where(eq(settings.key, BRANDING_KEY))
		.limit(1);

	if (existing) {
		await db.update(settings).set({ value: serialized }).where(eq(settings.key, BRANDING_KEY));
	} else {
		await db.insert(settings).values({ key: BRANDING_KEY, value: serialized });
	}

	return next;
}

export async function getAuthSettings(defaults: Partial<AuthSettingsDefaults> = {}) {
	const normalizedDefaults = normalizeAuthSettingsDefaults(defaults);
	const [row] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, AUTH_SETTINGS_KEY))
		.limit(1);

	if (!row) {
		return getDefaultAuthSettings(normalizedDefaults);
	}

	try {
		return toAuthSettings(JSON.parse(row.value), normalizedDefaults);
	} catch {
		return getDefaultAuthSettings(normalizedDefaults);
	}
}

export async function saveAuthSettings(
	input: Partial<AuthSettings>,
	defaults: Partial<AuthSettingsDefaults> = {}
) {
	const normalizedDefaults = normalizeAuthSettingsDefaults(defaults);
	const current = await getAuthSettings(normalizedDefaults);
	const allowedProviderSet = new Set(normalizedDefaults.availableSocialProviders);

	const next: AuthSettings = {
		registrationEnabled:
			typeof input.registrationEnabled === 'boolean'
				? input.registrationEnabled
				: current.registrationEnabled,
		anonymousTokensEnabled:
			typeof input.anonymousTokensEnabled === 'boolean'
				? input.anonymousTokensEnabled
				: current.anonymousTokensEnabled,
		enabledSocialProviders: Array.isArray(input.enabledSocialProviders)
			? input.enabledSocialProviders.filter(
					(provider): provider is SupportedSocialProviderId =>
						typeof provider === 'string' &&
						allowedProviderSet.has(provider as SupportedSocialProviderId)
				)
			: current.enabledSocialProviders
	};

	const serialized = JSON.stringify(next);

	const [existing] = await db
		.select({ key: settings.key })
		.from(settings)
		.where(eq(settings.key, AUTH_SETTINGS_KEY))
		.limit(1);

	if (existing) {
		await db.update(settings).set({ value: serialized }).where(eq(settings.key, AUTH_SETTINGS_KEY));
	} else {
		await db.insert(settings).values({ key: AUTH_SETTINGS_KEY, value: serialized });
	}

	return next;
}
