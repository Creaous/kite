import 'dotenv/config';

import { resolveAuthPluginIds, toOrderedAuthPluginIds, type AuthPluginId } from '$lib/auth/plugins';
import {
	getConfiguredSocialProvidersFromEnv,
	type SupportedSocialProviderId
} from '$lib/server/auth-providers';
import { db } from '$lib/server/db';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { APIError, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { admin as adminPlugin, anonymous } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { ac, admin, trusted, user } from '../permissions';
import * as schemas from './db/schema';
import { createAuthMiddleware } from 'better-auth/api';
import { getAuthSettings } from './services/settings';
import { consumeToken, decodeToken, verifyToken } from './services/token';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';

const { ...schema } = schemas;

export type SocialProvidersEnum = SupportedSocialProviderId;

export const isEmailAndPasswordEnabled = process.env.ALLOW_EMAIL_AND_PASSWORD !== 'false';
export const isAnonymousEnabled = process.env.ALLOW_ANONYMOUS_USERS === 'true';
export const isPasskeyEnabled = process.env.ALLOW_PASSKEYS !== 'false';
export const isInitialSetupEnabled = process.env.ENABLE_INITIAL_SETUP !== 'false';

const { providers: socialProviders, configuredProviderIds } = getConfiguredSocialProvidersFromEnv();

const enabledPluginIds = resolveAuthPluginIds({
	anonymous: isAnonymousEnabled,
	passkey: isPasskeyEnabled
});

/**
 * Better Auth plugins configuration based on environment variables
 */
const plugins = [
	adminPlugin({
		ac,
		roles: {
			admin,
			user,
			trusted
		}
	}),
	...(enabledPluginIds.has('anonymous') ? [anonymous()] : []),
	...(enabledPluginIds.has('passkey') ? [passkey()] : []),
	sveltekitCookies(getRequestEvent)
] satisfies BetterAuthPlugin[];

/**
 * Check if a specific auth plugin is enabled
 * @param value - Plugin ID to check
 * @returns True if plugin is enabled
 */
export function isPluginAvailable(value: string): value is AuthPluginId {
	return enabledPluginIds.has(value as AuthPluginId);
}

export function getEnabledAuthPlugins() {
	return toOrderedAuthPluginIds(enabledPluginIds);
}

/**
 * Check if a specific social provider is configured
 * @param socialProvider - Social provider name
 * @returns True if provider is available
 */
export function isSocialProviderAvailable(socialProvider: SocialProvidersEnum) {
	return !!socialProviders[socialProvider];
}

/**
 * Get list of all configured social providers
 * @returns Array of provider names
 */
export function getAvailableSocialProviders() {
	return configuredProviderIds;
}

/**
 * Better Auth instance configured with database adapter and plugins
 */
export const auth = betterAuth({
	baseURL: process.env.ORIGIN,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema
	}),
	emailAndPassword: {
		enabled: isEmailAndPasswordEnabled,
		requireEmailVerification: false
	},
	advanced: {
		disableOriginCheck: process.env.NODE_ENV === 'development' ? true : false
	},
	secret: process.env.BETTER_AUTH_SECRET || 'default-build-secret',
	socialProviders,
	plugins,
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (!isInitialSetupEnabled) return;
			if (ctx.path !== '/sign-up/email') return;
			if (!ctx.context.returned) return;

			const returned = ctx.context.returned as { user?: { id: string } };
			if (!returned.user) return;

			const users = await db.query.user.findMany({
				limit: 2,
				orderBy: {
					createdAt: 'desc'
				},
				columns: { id: true }
			});

			if (users.length > 1) return;

			await db
				.update(schemas.user)
				.set({ role: 'admin', emailVerified: true })
				.where(eq(schemas.user.id, returned.user.id));

			console.log(
				`First user created with email sign-up, assigned admin role: ${returned.user.id}`
			);
		}),
		before: createAuthMiddleware(async (ctx) => {
			const authSettings = await getAuthSettings({
				registrationEnabled: isEmailAndPasswordEnabled,
				anonymousTokensEnabled: isAnonymousEnabled,
				availableSocialProviders: configuredProviderIds
			});

			if (ctx.path === '/sign-up/email') {
				if (!isEmailAndPasswordEnabled || !authSettings.registrationEnabled) {
					throw new APIError('FORBIDDEN', { message: 'Registration is disabled.' });
				}
				return;
			}

			if (ctx.path === '/sign-in/social') {
				const body = (ctx.body ?? {}) as {
					provider?: unknown;
					requestSignUp?: unknown;
				};
				const provider =
					typeof body.provider === 'string' ? (body.provider as SupportedSocialProviderId) : null;

				if (provider && !authSettings.enabledSocialProviders.includes(provider)) {
					throw new APIError('FORBIDDEN', { message: 'This social provider is disabled.' });
				}

				if (!authSettings.registrationEnabled && body.requestSignUp === true) {
					throw new APIError('FORBIDDEN', { message: 'Registration is disabled.' });
				}

				return;
			}

			if (ctx.path !== '/sign-in/anonymous') return;

			if (!isAnonymousEnabled || !authSettings.anonymousTokensEnabled) {
				throw new APIError('FORBIDDEN', { message: 'Anonymous access is disabled.' });
			}

			// Protect the anonymous endpoint by requiring a server-side token
			if (!ctx.query || !ctx.query.token) {
				throw new APIError('UNAUTHORIZED', { message: 'This endpoint requires a valid token.' });
			}

			try {
				const token = decodeToken(ctx.query.token);
				const { payload, token: tokenRecord } = await verifyToken(token as string);
				if (tokenRecord.purpose !== 'anonymous' || payload.purpose !== 'anonymous') {
					throw new APIError('UNAUTHORIZED', { message: 'This endpoint requires a valid token.' });
				}

				await consumeToken(token as string);
			} catch {
				throw new APIError('UNAUTHORIZED', { message: 'This endpoint requires a valid token.' });
			}
		})
	}
});
