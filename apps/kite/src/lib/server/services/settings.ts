import type { SupportedSocialProviderId } from '$lib/server/auth-providers';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const SETTINGS_KEYS = {
	branding: 'branding',
	auth: 'auth',
	alerts: 'alerts'
} as const;

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export type AlertBanner = {
	enabled: boolean;
	message: string;
	type: AlertType;
};

export type AlertSettings = {
	globalAnnouncement: AlertBanner;
	shareFlowAlert: AlertBanner;
};

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
	publicApiEnabled: boolean;
	enabledSocialProviders: SupportedSocialProviderId[];
};

export type AuthSettingsDefaults = {
	registrationEnabled: boolean;
	anonymousTokensEnabled: boolean;
	publicApiEnabled: boolean;
	availableSocialProviders: readonly SupportedSocialProviderId[];
};

const defaultBranding: BrandingSettings = {
	appName: 'Kite',
	tagline: '',
	logoUrl: '',
	faviconUrl: '',
	disableIndexing: true
};

const defaultAlertBanner: AlertBanner = {
	enabled: false,
	message: '',
	type: 'info'
};

const defaultAlertSettings: AlertSettings = {
	globalAnnouncement: { ...defaultAlertBanner },
	shareFlowAlert: { ...defaultAlertBanner }
};

function isAlertType(value: unknown): value is AlertType {
	return value === 'info' || value === 'success' || value === 'warning' || value === 'error';
}

function toAlertBanner(value: unknown): AlertBanner {
	if (!value || typeof value !== 'object') {
		return { ...defaultAlertBanner };
	}

	const parsed = value as Partial<AlertBanner>;

	return {
		enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaultAlertBanner.enabled,
		message: typeof parsed.message === 'string' ? parsed.message : defaultAlertBanner.message,
		type: isAlertType(parsed.type) ? parsed.type : defaultAlertBanner.type
	};
}

function toAlertSettings(value: unknown): AlertSettings {
	if (!value || typeof value !== 'object') {
		return defaultAlertSettings;
	}

	const parsed = value as Partial<AlertSettings>;

	return {
		globalAnnouncement: toAlertBanner(parsed.globalAnnouncement),
		shareFlowAlert: toAlertBanner(parsed.shareFlowAlert)
	};
}

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
		publicApiEnabled:
			typeof defaults.publicApiEnabled === 'boolean' ? defaults.publicApiEnabled : false,
		availableSocialProviders: Array.isArray(defaults.availableSocialProviders)
			? defaults.availableSocialProviders
			: []
	};
}

function getDefaultAuthSettings(defaults: AuthSettingsDefaults): AuthSettings {
	return {
		registrationEnabled: defaults.registrationEnabled,
		anonymousTokensEnabled: defaults.anonymousTokensEnabled,
		publicApiEnabled: defaults.publicApiEnabled,
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
		publicApiEnabled:
			typeof parsed.publicApiEnabled === 'boolean'
				? parsed.publicApiEnabled
				: fallback.publicApiEnabled,
		enabledSocialProviders
	};
}

export async function getBrandingSettings() {
	const [row] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEYS.branding))
		.limit(1);

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
		.where(eq(settings.key, SETTINGS_KEYS.branding))
		.limit(1);

	if (existing) {
		await db
			.update(settings)
			.set({ value: serialized })
			.where(eq(settings.key, SETTINGS_KEYS.branding));
	} else {
		await db.insert(settings).values({ key: SETTINGS_KEYS.branding, value: serialized });
	}

	return next;
}

export async function getAuthSettings(defaults: Partial<AuthSettingsDefaults> = {}) {
	const normalizedDefaults = normalizeAuthSettingsDefaults(defaults);
	const [row] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEYS.auth))
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
		publicApiEnabled:
			typeof input.publicApiEnabled === 'boolean'
				? input.publicApiEnabled
				: current.publicApiEnabled,
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
		.where(eq(settings.key, SETTINGS_KEYS.auth))
		.limit(1);

	if (existing) {
		await db
			.update(settings)
			.set({ value: serialized })
			.where(eq(settings.key, SETTINGS_KEYS.auth));
	} else {
		await db.insert(settings).values({ key: SETTINGS_KEYS.auth, value: serialized });
	}

	return next;
}

export async function getAlertSettings() {
	const [row] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEYS.alerts))
		.limit(1);

	if (!row) {
		return defaultAlertSettings;
	}

	try {
		return toAlertSettings(JSON.parse(row.value));
	} catch {
		return defaultAlertSettings;
	}
}

export async function saveAlertSettings(input: Partial<AlertSettings>) {
	const current = await getAlertSettings();

	const next: AlertSettings = {
		globalAnnouncement: {
			enabled:
				typeof input.globalAnnouncement?.enabled === 'boolean'
					? input.globalAnnouncement.enabled
					: current.globalAnnouncement.enabled,
			message:
				typeof input.globalAnnouncement?.message === 'string'
					? input.globalAnnouncement.message.trim()
					: current.globalAnnouncement.message,
			type: isAlertType(input.globalAnnouncement?.type)
				? input.globalAnnouncement.type
				: current.globalAnnouncement.type
		},
		shareFlowAlert: {
			enabled:
				typeof input.shareFlowAlert?.enabled === 'boolean'
					? input.shareFlowAlert.enabled
					: current.shareFlowAlert.enabled,
			message:
				typeof input.shareFlowAlert?.message === 'string'
					? input.shareFlowAlert.message.trim()
					: current.shareFlowAlert.message,
			type: isAlertType(input.shareFlowAlert?.type)
				? input.shareFlowAlert.type
				: current.shareFlowAlert.type
		}
	};

	const serialized = JSON.stringify(next);

	const [existing] = await db
		.select({ key: settings.key })
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEYS.alerts))
		.limit(1);

	if (existing) {
		await db
			.update(settings)
			.set({ value: serialized })
			.where(eq(settings.key, SETTINGS_KEYS.alerts));
	} else {
		await db.insert(settings).values({ key: SETTINGS_KEYS.alerts, value: serialized });
	}

	return next;
}
