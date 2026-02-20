import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { settings } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
	getAuthSettings,
	getBrandingSettings,
	saveAuthSettings,
	saveBrandingSettings
} from './settings';

describe('settings service (db)', () => {
	it('returns branding defaults when unset', async () => {
		const branding = await getBrandingSettings();

		expect(branding.appName).toBe('Kite');
		expect(branding.tagline).toBe('');
		expect(branding.logoUrl).toBe('');
		expect(branding.faviconUrl).toBe('');
		expect(branding.disableIndexing).toBe(false);
	});

	it('saves and reloads branding settings', async () => {
		const saved = await saveBrandingSettings({
			appName: 'Kite Pro',
			tagline: 'Share faster',
			logoUrl: 'https://example.com/logo.svg',
			faviconUrl: 'https://example.com/favicon.ico',
			disableIndexing: true
		});

		expect(saved.appName).toBe('Kite Pro');
		expect(saved.disableIndexing).toBe(true);

		const reloaded = await getBrandingSettings();
		expect(reloaded).toEqual(saved);
	});

	it('returns auth defaults when unset', async () => {
		const auth = await getAuthSettings({
			registrationEnabled: false,
			anonymousTokensEnabled: true,
			availableSocialProviders: ['github', 'google']
		});

		expect(auth.registrationEnabled).toBe(false);
		expect(auth.anonymousTokensEnabled).toBe(true);
		expect(auth.enabledSocialProviders).toEqual(['github', 'google']);
	});

	it('saves auth settings and filters unsupported providers', async () => {
		const saved = await saveAuthSettings(
			{
				registrationEnabled: true,
				anonymousTokensEnabled: false,
				enabledSocialProviders: ['github', 'discord', 'not-real' as never]
			},
			{
				registrationEnabled: true,
				anonymousTokensEnabled: true,
				availableSocialProviders: ['github', 'discord']
			}
		);

		expect(saved.registrationEnabled).toBe(true);
		expect(saved.anonymousTokensEnabled).toBe(false);
		expect(saved.enabledSocialProviders).toEqual(['github', 'discord']);

		const reloaded = await getAuthSettings({
			registrationEnabled: true,
			anonymousTokensEnabled: true,
			availableSocialProviders: ['github', 'discord']
		});

		expect(reloaded).toEqual(saved);
	});

	it('falls back to defaults when stored auth value is invalid JSON', async () => {
		await db.insert(settings).values({ key: 'auth', value: '{invalid-json' });

		const auth = await getAuthSettings({
			registrationEnabled: true,
			anonymousTokensEnabled: false,
			availableSocialProviders: ['github']
		});

		expect(auth.registrationEnabled).toBe(true);
		expect(auth.anonymousTokensEnabled).toBe(false);
		expect(auth.enabledSocialProviders).toEqual(['github']);

		await db.delete(settings).where(eq(settings.key, 'auth'));
	});
});
