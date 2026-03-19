import 'dotenv/config';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { APIError, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { admin as adminPlugin, anonymous } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { resolveAuthPluginIds, toOrderedAuthPluginIds, type AuthPluginId } from '$lib/auth/plugins';
import {
	getConfiguredSocialProvidersFromEnv,
	type SupportedSocialProviderId
} from '$lib/server/auth-providers';
import { db } from '$lib/server/db';
import { ac, admin, trusted, user } from '../permissions';
import * as schemas from './db/schema';
import { getAuthSettings } from './services/settings';
import {
	sendPasswordResetEmail,
	sendVerificationEmail as sendAuthVerificationEmail
} from './services/authEmail';
import { consumeToken, decodeToken, verifyToken } from './services/token';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';

const { ...schema } = schemas;

export type SocialProvidersEnum = SupportedSocialProviderId;

export const isEmailAndPasswordEnabled = process.env.ALLOW_EMAIL_AND_PASSWORD !== 'false';
export const isAnonymousEnabled = process.env.ALLOW_ANONYMOUS_USERS === 'true';
export const isPasskeyEnabled = process.env.ALLOW_PASSKEYS !== 'false';
export const isInitialSetupEnabled = process.env.ENABLE_INITIAL_SETUP !== 'false';
const trustProxy = process.env.TRUST_PROXY === 'true';

const origin = process.env.ORIGIN;
const authSecret = process.env.BETTER_AUTH_SECRET;

let hasValidatedProductionAuthEnv = false;

export function assertAuthEnvironmentForRuntime() {
	if (process.env.NODE_ENV !== 'production' || hasValidatedProductionAuthEnv) {
		return;
	}

	if (!process.env.ORIGIN) {
		throw new Error('ORIGIN must be configured in production');
	}

	const runtimeSecret = process.env.BETTER_AUTH_SECRET;
	if (!runtimeSecret || runtimeSecret === 'default-build-secret') {
		throw new Error('BETTER_AUTH_SECRET must be configured in production');
	}

	hasValidatedProductionAuthEnv = true;
}

if (process.env.NODE_ENV !== 'production') {
	if (!authSecret || authSecret === 'default-build-secret') {
		console.warn(
			'[security] BETTER_AUTH_SECRET is not set or is using the insecure default value. ' +
				'Set a strong random secret via the BETTER_AUTH_SECRET environment variable.'
		);
	}
}

const { providers: socialProviders, configuredProviderIds } = getConfiguredSocialProvidersFromEnv();

const enabledPluginIds = resolveAuthPluginIds({
	anonymous: isAnonymousEnabled,
	passkey: isPasskeyEnabled
});

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

export function isPluginAvailable(value: string): value is AuthPluginId {
	return enabledPluginIds.has(value as AuthPluginId);
}

export function getEnabledAuthPlugins() {
	return toOrderedAuthPluginIds(enabledPluginIds);
}

export function isSocialProviderAvailable(socialProvider: SocialProvidersEnum) {
	return !!socialProviders[socialProvider];
}

export function getAvailableSocialProviders() {
	return configuredProviderIds;
}

export const auth = betterAuth({
	baseURL: origin ?? 'http://localhost:3000',
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema
	}),
	emailAndPassword: {
		enabled: isEmailAndPasswordEnabled,
		requireEmailVerification: false,
		sendResetPassword: async ({ user, url }) => {
			void sendPasswordResetEmail(
				{
					email: user.email,
					name: user.name
				},
				url
			).catch((error) => {
				console.error('[auth] Failed to send password reset email', error);
			});
		}
	},
	emailVerification: {
		sendOnSignUp: false,
		sendVerificationEmail: async ({ user, url }) => {
			void sendAuthVerificationEmail(
				{
					email: user.email,
					name: user.name
				},
				url
			).catch((error) => {
				console.error('[auth] Failed to send verification email', error);
			});
		}
	},
	advanced: {
		disableOriginCheck: process.env.NODE_ENV === 'development' ? true : false,
		trustedProxyHeaders: trustProxy,
		ipAddress: {
			ipAddressHeaders: trustProxy
				? ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']
				: ['x-forwarded-for']
		}
	},
	secret: authSecret && authSecret !== 'default-build-secret' ? authSecret : 'default-build-secret',
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
