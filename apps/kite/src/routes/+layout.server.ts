import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';
import { isAnonymousEnabled, isEmailAndPasswordEnabled } from '$lib/server/auth';
import { getConfiguredSocialProvidersFromEnv } from '$lib/server/auth-providers';
import {
	getAlertSettings,
	getAuthSettings,
	getBrandingSettings
} from '$lib/server/services/settings';

function isPublicPath(pathname: string) {
	if (pathname === '/sign-in' || pathname === '/sign-up') return true;
	if (pathname.startsWith('/s/')) return true;
	if (pathname.startsWith('/r/')) return true;
	if (pathname.startsWith('/api')) return true;
	return false;
}

function toSafeNext(pathname: string, search: string) {
	const value = `${pathname}${search}`;
	if (!value.startsWith('/')) return '/';
	if (value.startsWith('//')) return '/';
	return value;
}

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const pathname = url.pathname;
	const branding = await getBrandingSettings();
	const alertSettings = await getAlertSettings();
	const { configuredProviderIds } = getConfiguredSocialProvidersFromEnv();
	const authSettings = await getAuthSettings({
		registrationEnabled: isEmailAndPasswordEnabled,
		anonymousTokensEnabled: isAnonymousEnabled,
		availableSocialProviders: configuredProviderIds
	});

	if (!locals.user && !isPublicPath(pathname)) {
		const next = toSafeNext(pathname, url.search);
		throw redirect(303, `/sign-in?next=${encodeURIComponent(next)}`);
	}

	if (locals.user && (pathname === '/sign-in' || pathname === '/sign-up')) {
		const nextParam = url.searchParams.get('next');
		const next =
			nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
		throw redirect(303, next);
	}

	return {
		user: locals.user ?? null,
		session: locals.session ?? null,
		branding,
		alertSettings,
		authSettings,
		isDevelopment: process.env.NODE_ENV === 'development'
	};
};
