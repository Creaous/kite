import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { getAuthSettings } from '$lib/server/services/settings';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { json } from '@sveltejs/kit';

const API_PREFIX = '/api';
const API_WHITELIST_PREFIXES = ['/api/auth', '/api/v1/uploads'] as const;

function isWhitelistedApiPath(pathname: string) {
	return API_WHITELIST_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

const handlePublicApiAvailability: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Allow server-side event.fetch subrequests to continue working even when public API is disabled.
	if (event.isSubRequest) {
		return resolve(event);
	}

	if (!pathname.startsWith(API_PREFIX) || isWhitelistedApiPath(pathname)) {
		return resolve(event);
	}

	const authSettings = await getAuthSettings({ publicApiEnabled: true });
	if (authSettings.publicApiEnabled) {
		return resolve(event);
	}

	return json(
		{
			error: {
				code: 'PUBLIC_API_DISABLED',
				message: 'Public API is disabled by an administrator'
			}
		},
		{ status: 503 }
	);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	if (event.url.pathname === '/api/auth' || event.url.pathname.startsWith('/api/auth/')) {
		return auth.handler(event.request);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(
	handleParaglide,
	handlePublicApiAvailability,
	handleBetterAuth
);
